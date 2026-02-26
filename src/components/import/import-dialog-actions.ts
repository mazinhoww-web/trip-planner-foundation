import { toast } from 'sonner';
import { TablesInsert } from '@/integrations/supabase/types';
import { generateStayTips } from '@/services/ai';
import { calculateStayCoverageGaps, calculateTransportCoverageGaps } from '@/services/tripInsights';
import { computeFileHash, findImportedDocumentByHash, withImportHash } from '@/services/importPersist';
import { trackProductEvent } from '@/services/productAnalytics';
import { dispatchTripWebhook } from '@/services/webhooks';
import {
  ExtractedReservation,
  extractReservationStructured,
  runOcrDocument,
  tryExtractNativeText,
  uploadImportFile,
} from '@/services/importPipeline';
import {
  computeCriticalMissingFields,
  inferFallbackExtraction,
  mergeMissingFields,
  resolveImportScope,
  resolveImportType,
  toIsoDateTime,
} from '@/components/import/import-helpers';
import {
  appendExtractionSnapshot,
  convertToBrl,
  diffNights,
  hotelPhotoUrls,
  toDateLabel,
  toReviewState,
  typeLabel,
} from '@/components/import/import-dialog-helpers';
import {
  defaultVisualSteps,
  ImportQueueItem,
  ImportSummary,
  ReviewState,
  StepStatus,
  VisualStepKey,
} from '@/components/import/import-types';

type CreateModule = {
  data: any[];
  create: (payload: any) => Promise<any>;
};

type DocumentsModule = {
  data: any[];
  create: (payload: any) => Promise<any>;
  update: (payload: { id: string; updates: any }) => Promise<any>;
};

type UpdateItemFn = (itemId: string, updater: (item: ImportQueueItem) => ImportQueueItem) => void;
type UpdateStepFn = (itemId: string, key: VisualStepKey, status: StepStatus) => void;

type ProcessImportQueueItemParams = {
  itemId: string;
  queue: ImportQueueItem[];
  userId: string | null | undefined;
  currentTripId: string | null;
  currentTripDestination: string | null | undefined;
  documentsModule: DocumentsModule;
  setItem: UpdateItemFn;
  setItemStep: UpdateStepFn;
  options?: { reprocess?: boolean };
};

type SaveReviewedQueueItemParams = {
  activeItem: ImportQueueItem;
  currentTripId: string | null;
  currentTripDataRange: { data_inicio: string | null; data_fim: string | null };
  currentTripDestination: string | null | undefined;
  documentsModule: DocumentsModule;
  flightsModule: CreateModule;
  staysModule: CreateModule & { update: (payload: { id: string; updates: any }) => Promise<any> };
  transportsModule: CreateModule;
  restaurantsModule: CreateModule;
  setItem: UpdateItemFn;
  setItemStep: UpdateStepFn;
};

type SaveResult = {
  ok: boolean;
  error?: string;
};

export function updateImportReviewState(
  activeItem: ImportQueueItem | null,
  setItem: UpdateItemFn,
  updater: (review: ReviewState) => ReviewState,
) {
  if (!activeItem?.reviewState) return;
  setItem(activeItem.id, (item) => {
    if (!item.reviewState) return item;
    const nextReview = updater(item.reviewState);
    const computedMissingFields = computeCriticalMissingFields(nextReview.type, nextReview, item.scope);
    return {
      ...item,
      reviewState: nextReview,
      missingFields: mergeMissingFields(item.missingFields, computedMissingFields),
    };
  });
}

export async function processImportQueueItem({
  itemId,
  queue,
  userId,
  currentTripId,
  currentTripDestination,
  documentsModule,
  setItem,
  setItemStep,
  options,
}: ProcessImportQueueItemParams) {
  const item = queue.find((entry) => entry.id === itemId);
  if (!item || !userId || !currentTripId) return;

  const file = item.file;
  const previousCanonical = item.canonical;
  const fileHash = item.fileHash ?? await computeFileHash(file).catch(() => null);
  let documentId = item.documentId;
  const alreadyImportedDocument = findImportedDocumentByHash(documentsModule.data, fileHash);

  if (alreadyImportedDocument) {
    setItem(itemId, (current) => ({
      ...current,
      fileHash,
      documentId: alreadyImportedDocument.id,
      status: 'saved',
      warnings: current.warnings.concat('Este arquivo já foi importado anteriormente.'),
      summary: {
        type: 'documento',
        title: file.name,
        subtitle: 'Importação ignorada para evitar duplicidade.',
        amount: null,
        currency: 'BRL',
        estimatedBrl: null,
        checkIn: null,
        checkOut: null,
        nights: null,
        stayGapCount: 0,
        transportGapCount: 0,
        nextSteps: ['Arquivo duplicado detectado pela assinatura do documento.'],
      },
      visualSteps: {
        ...defaultVisualSteps(),
        read: 'completed',
        identified: 'completed',
        saving: 'completed',
        photos: 'skipped',
        tips: 'skipped',
        done: 'completed',
      },
    }));
    return;
  }

  setItem(itemId, (current) => ({
    ...current,
    fileHash,
    status: 'processing',
    scope: 'trip_related',
    warnings: [],
    confidence: null,
    typeConfidence: null,
    extractionQuality: 'low',
    missingFields: [],
    identifiedType: options?.reprocess ? current.identifiedType : null,
    needsUserConfirmation: true,
    reviewState: options?.reprocess ? current.reviewState : null,
    rawText: '',
    summary: null,
    canonical: options?.reprocess ? current.canonical : null,
    providerMeta: null,
    hotelPhotos: [],
    photoIndex: 0,
    documentId,
    visualSteps: { ...defaultVisualSteps(), read: 'in_progress' },
  }));

  const localWarnings: string[] = [];

  try {
    const [upload, native] = await Promise.all([
      uploadImportFile(file, userId, currentTripId),
      tryExtractNativeText(file),
    ]);
    if (!upload.uploaded && upload.warning) {
      localWarnings.push(upload.warning);
    }

    if (!documentId) {
      try {
        const createdDocument = await documentsModule.create({
          nome: file.name,
          tipo: `importacao/${upload.ext}`,
          arquivo_url: upload.path ?? null,
          importado: false,
          origem_importacao: 'arquivo',
        } as Omit<TablesInsert<'documentos'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'>);
        if (createdDocument?.id) {
          documentId = createdDocument.id;
          setItem(itemId, (current) => ({ ...current, documentId: createdDocument.id }));
        }
      } catch (metadataError) {
        console.error('[import][metadata_failure]', { file: file.name, error: metadataError });
        localWarnings.push('Falha ao registrar metadados do anexo.');
      }
    }
    let extractedText = native.text ?? '';

    if (!native.text) {
      try {
        const ocr = await runOcrDocument(file);
        extractedText = ocr.text ?? '';
        localWarnings.push(...ocr.warnings);
        if (ocr.qualityMetrics && ocr.qualityMetrics.text_length < 80) {
          localWarnings.push('Texto extraído com baixa qualidade.');
        }
      } catch (ocrError) {
        console.error('[import][ocr_failure]', { file: file.name, error: ocrError });
        localWarnings.push(ocrError instanceof Error ? ocrError.message : 'OCR não disponível no momento.');
      }
    }

    setItemStep(itemId, 'read', 'completed');
    setItemStep(itemId, 'identified', 'in_progress');

    let extracted: ExtractedReservation;
    if (extractedText.trim().length > 20) {
      try {
        extracted = await extractReservationStructured(extractedText, file.name);
      } catch (extractError) {
        console.error('[import][extract_failure]', { file: file.name, error: extractError });
        localWarnings.push(extractError instanceof Error ? extractError.message : 'Extração IA incompleta.');
        extracted = inferFallbackExtraction(extractedText, file.name, currentTripDestination);
      }
    } else {
      localWarnings.push('Texto insuficiente para extração automática.');
      extracted = inferFallbackExtraction(extractedText, file.name, currentTripDestination);
    }

    const resolvedScope = resolveImportScope(extracted, extractedText, file.name);
    const resolvedType = resolveImportType(extracted, extractedText, file.name);
    const review = resolvedScope === 'trip_related' ? toReviewState(extracted, resolvedType) : null;
    const computedMissingFields = computeCriticalMissingFields(review?.type ?? resolvedType, review, resolvedScope);
    const missingFields = resolvedScope === 'outside_scope'
      ? []
      : mergeMissingFields(extracted.missingFields ?? [], computedMissingFields);
    const quality = extracted.extraction_quality ?? (extractedText.length > 500 ? 'high' : extractedText.length > 120 ? 'medium' : 'low');
    const canonicalForStorage = withImportHash(extracted.canonical, fileHash, file.name);
    if (options?.reprocess && previousCanonical) {
      const previousSignature = JSON.stringify(previousCanonical);
      const currentSignature = JSON.stringify(canonicalForStorage);
      if (previousSignature === currentSignature) {
        localWarnings.push('Reprocessamento concluído sem mudanças relevantes nos dados extraídos.');
      }
    }
    const typeConfidenceFromCanonical = extracted.canonical?.metadata?.confianca != null
      ? Math.max(0, Math.min(1, Number(extracted.canonical.metadata.confianca) / 100))
      : null;
    const typeConfidence = typeConfidenceFromCanonical ?? extracted.type_confidence ?? extracted.confidence ?? 0;
    const needsUserConfirmation = true;
    const providerMeta = extracted.provider_meta ?? null;

    if (documentId) {
      try {
        await documentsModule.update({
          id: documentId,
          updates: {
            extracao_tipo: resolvedType,
            extracao_scope: resolvedScope,
            extracao_confianca: Math.round(typeConfidence * 100),
            extracao_payload: canonicalForStorage,
            tipo: resolvedScope === 'outside_scope' ? 'fora_escopo' : resolvedType,
            importado: false,
          } as any,
        });
      } catch (docUpdateError) {
        console.error('[import][document_preconfirm_update_failed]', docUpdateError);
        localWarnings.push('Falha ao atualizar metadados da extração.');
      }
    }

    setItem(itemId, (current) => ({
      ...current,
      status: 'auto_extracted',
      scope: resolvedScope,
      warnings: localWarnings,
      confidence: extracted.confidence,
      typeConfidence,
      extractionQuality: quality,
      missingFields,
      identifiedType: resolvedScope === 'trip_related' ? resolvedType : null,
      needsUserConfirmation,
      reviewState: review,
      canonical: canonicalForStorage,
      extractionHistory:
        options?.reprocess && previousCanonical
          ? appendExtractionSnapshot(
              current.extractionHistory,
              previousCanonical,
              current.providerMeta?.selected ?? null,
              current.typeConfidence ?? current.confidence ?? null,
            )
          : current.extractionHistory,
      providerMeta,
      fileHash,
      rawText: extractedText,
      visualSteps: {
        ...current.visualSteps,
        read: 'completed',
        identified: 'completed',
        saving: 'pending',
        photos: 'pending',
        tips: 'pending',
        done: 'pending',
      },
    }));

    setItem(itemId, (current) => ({
      ...current,
      status: needsUserConfirmation ? 'needs_confirmation' : current.status,
    }));
  } catch (error) {
    console.error('[import][pipeline_fatal]', { file: file.name, error });
    const fallbackWarning = error instanceof Error ? error.message : 'Falha geral na análise.';
    setItem(itemId, (current) => ({
      ...current,
      status: 'failed',
      identifiedType: current.identifiedType ?? item.identifiedType,
      reviewState: current.reviewState ?? item.reviewState,
      canonical: current.canonical ?? previousCanonical,
      warnings: localWarnings.concat(fallbackWarning),
      visualSteps: {
        ...current.visualSteps,
        read: 'failed',
      },
    }));
  }
}

export async function saveReviewedQueueItem({
  activeItem,
  currentTripId,
  currentTripDataRange,
  currentTripDestination,
  documentsModule,
  flightsModule,
  staysModule,
  transportsModule,
  restaurantsModule,
  setItem,
  setItemStep,
}: SaveReviewedQueueItemParams): Promise<SaveResult> {
  if (activeItem.scope === 'trip_related' && !activeItem.reviewState) {
    return { ok: false, error: 'Dados de revisão ausentes para este item.' };
  }

  const reviewState = activeItem.reviewState;
  const canonical = activeItem.canonical;
  const canonicalType = canonical?.metadata?.tipo?.toLowerCase() ?? null;
  const canonicalConfidence = canonical?.metadata?.confianca ?? null;
  const extractionScope = activeItem.scope;

  try {
    let flightsAfter = [...flightsModule.data];
    let staysAfter = [...staysModule.data];
    let transportsAfter = [...transportsModule.data];
    let title = 'Reserva importada';
    let subtitle = 'Dados salvos com sucesso';
    let amount: number | null = null;
    let currency = 'BRL';
    let checkIn: string | null = null;
    let checkOut: string | null = null;
    let photos: string[] = [];

    if (activeItem.scope === 'outside_scope') {
      if (!activeItem.documentId) {
        throw new Error('Não foi possível salvar este arquivo em Documentos agora. Tente novamente.');
      }

      await documentsModule.update({
        id: activeItem.documentId,
        updates: {
          tipo: 'fora_escopo',
          extracao_scope: 'outside_scope',
          extracao_tipo: canonicalType ?? activeItem.identifiedType ?? null,
          extracao_confianca: canonicalConfidence != null ? Math.round(Number(canonicalConfidence)) : null,
          extracao_payload: withImportHash(canonical, activeItem.fileHash, activeItem.file.name),
          importado: true,
          origem_importacao: 'arquivo',
        } as any,
      });

      title = activeItem.file.name;
      subtitle = 'Arquivo salvo apenas em Documentos (fora de escopo da viagem).';
      setItemStep(activeItem.id, 'photos', 'skipped');
      setItemStep(activeItem.id, 'tips', 'skipped');
    } else if (reviewState?.type === 'voo') {
      const payload: Omit<TablesInsert<'voos'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
        numero: reviewState.voo.numero || null,
        companhia: reviewState.voo.companhia || null,
        origem: reviewState.voo.origem || null,
        destino: reviewState.voo.destino || null,
        data: toIsoDateTime(reviewState.voo.data_inicio, reviewState.voo.hora_inicio),
        status: reviewState.voo.status,
        valor: reviewState.voo.valor ? Number(reviewState.voo.valor) : null,
        moeda: reviewState.voo.moeda || 'BRL',
      };
      const displayName = reviewState.voo.nome_exibicao || null;
      const created = await flightsModule.create(payload);
      if (!created) {
        throw new Error('Não foi possível salvar o voo importado.');
      }
      flightsAfter = [created, ...flightsAfter];
      title = displayName || payload.numero || payload.companhia || 'Voo importado';
      subtitle = `${payload.origem || 'Origem'} → ${payload.destino || 'Destino'}`;
      amount = payload.valor ?? null;
      currency = payload.moeda ?? 'BRL';
      setItemStep(activeItem.id, 'photos', 'skipped');
      setItemStep(activeItem.id, 'tips', 'skipped');
    }

    if (reviewState?.type === 'hospedagem') {
      const inferredTips = {
        dica_viagem: reviewState.hospedagem.dica_viagem || canonical?.enriquecimento_ia?.dica_viagem || null,
        como_chegar: reviewState.hospedagem.como_chegar || canonical?.enriquecimento_ia?.como_chegar || null,
        atracoes_proximas: reviewState.hospedagem.atracoes_proximas || canonical?.enriquecimento_ia?.atracoes_proximas || null,
        restaurantes_proximos: reviewState.hospedagem.restaurantes_proximos || canonical?.enriquecimento_ia?.restaurantes_proximos || null,
        dica_ia:
          reviewState.hospedagem.dica_ia ||
          reviewState.hospedagem.dica_viagem ||
          canonical?.enriquecimento_ia?.dica_viagem ||
          null,
      };
      const payload: Omit<TablesInsert<'hospedagens'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
        nome: reviewState.hospedagem.nome || null,
        localizacao: reviewState.hospedagem.localizacao || null,
        check_in: reviewState.hospedagem.check_in || null,
        check_out: reviewState.hospedagem.check_out || null,
        status: reviewState.hospedagem.status,
        valor: reviewState.hospedagem.valor ? Number(reviewState.hospedagem.valor) : null,
        moeda: reviewState.hospedagem.moeda || 'BRL',
        dica_viagem: inferredTips.dica_viagem,
        como_chegar: inferredTips.como_chegar,
        atracoes_proximas: inferredTips.atracoes_proximas,
        restaurantes_proximos: inferredTips.restaurantes_proximos,
        dica_ia: inferredTips.dica_ia,
      };
      const stayDisplayName = reviewState.hospedagem.nome_exibicao || null;

      const created = await staysModule.create(payload);
      if (!created) {
        throw new Error('Não foi possível salvar a hospedagem importada.');
      }
      staysAfter = [created, ...staysAfter];
      setItemStep(activeItem.id, 'photos', 'in_progress');
      photos = hotelPhotoUrls(created.nome ?? '', created.localizacao ?? '');
      setItemStep(activeItem.id, 'photos', 'completed');

      setItemStep(activeItem.id, 'tips', 'in_progress');
      const hasAnyTip = !!(
        inferredTips.dica_viagem ||
        inferredTips.como_chegar ||
        inferredTips.atracoes_proximas ||
        inferredTips.restaurantes_proximos
      );
      if (!hasAnyTip) {
        const tips = await generateStayTips({
          hotelName: created.nome,
          location: created.localizacao,
          checkIn: created.check_in,
          checkOut: created.check_out,
          tripDestination: currentTripDestination,
        });

        if (tips.data) {
          try {
            await staysModule.update({ id: created.id, updates: tips.data });
            staysAfter = [{ ...created, ...tips.data }, ...staysAfter.filter((entry) => entry.id !== created.id)];
          } catch (tipError) {
            console.error('[import][stay_tips_update_failed]', tipError);
            setItem(activeItem.id, (item) => ({
              ...item,
              warnings: item.warnings.concat('Reserva salva, mas as dicas IA não puderam ser persistidas agora.'),
            }));
          }
        }

        if (tips.fromFallback) {
          setItem(activeItem.id, (item) => ({
            ...item,
            warnings: item.warnings.concat('Dicas de hospedagem em modo fallback; revise antes da viagem.'),
          }));
        }
      }
      setItemStep(activeItem.id, 'tips', 'completed');

      title = stayDisplayName || payload.nome || 'Hospedagem importada';
      subtitle = `${payload.localizacao || 'Local não informado'} · ${payload.check_in || 'sem check-in'} a ${payload.check_out || 'sem check-out'}`;
      amount = payload.valor ?? null;
      currency = payload.moeda ?? 'BRL';
      checkIn = payload.check_in ?? null;
      checkOut = payload.check_out ?? null;
    }

    if (reviewState?.type === 'transporte') {
      const payload: Omit<TablesInsert<'transportes'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
        tipo: reviewState.transporte.tipo || null,
        operadora: reviewState.transporte.operadora || null,
        origem: reviewState.transporte.origem || null,
        destino: reviewState.transporte.destino || null,
        data: toIsoDateTime(reviewState.transporte.data_inicio, reviewState.transporte.hora_inicio),
        status: reviewState.transporte.status,
        valor: reviewState.transporte.valor ? Number(reviewState.transporte.valor) : null,
        moeda: reviewState.transporte.moeda || 'BRL',
      };

      const created = await transportsModule.create(payload);
      if (!created) {
        throw new Error('Não foi possível salvar o transporte importado.');
      }
      transportsAfter = [created, ...transportsAfter];

      title = payload.tipo || payload.operadora || 'Transporte importado';
      subtitle = `${payload.origem || 'Origem'} → ${payload.destino || 'Destino'}`;
      amount = payload.valor ?? null;
      currency = payload.moeda ?? 'BRL';
      setItemStep(activeItem.id, 'photos', 'skipped');
      setItemStep(activeItem.id, 'tips', 'skipped');
    }

    if (reviewState?.type === 'restaurante') {
      const payload: Omit<TablesInsert<'restaurantes'>, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'viagem_id'> = {
        nome: reviewState.restaurante.nome || 'Restaurante importado',
        cidade: reviewState.restaurante.cidade || null,
        tipo: reviewState.restaurante.tipo || null,
        rating: reviewState.restaurante.rating ? Number(reviewState.restaurante.rating) : null,
        salvo: true,
      };

      const created = await restaurantsModule.create(payload);
      if (!created) {
        throw new Error('Não foi possível salvar o restaurante importado.');
      }
      title = payload.nome;
      subtitle = `${payload.cidade || 'Cidade não informada'} · ${payload.tipo || 'Tipo não informado'}`;
      setItemStep(activeItem.id, 'photos', 'skipped');
      setItemStep(activeItem.id, 'tips', 'skipped');
    }

    if (activeItem.documentId) {
      try {
        await documentsModule.update({
          id: activeItem.documentId,
          updates: {
            tipo: reviewState?.type ?? activeItem.identifiedType ?? (canonicalType as string | null),
            extracao_scope: extractionScope,
            extracao_tipo: canonicalType ?? reviewState?.type ?? activeItem.identifiedType ?? null,
            extracao_confianca: canonicalConfidence != null ? Math.round(Number(canonicalConfidence)) : null,
            extracao_payload: withImportHash(canonical, activeItem.fileHash, activeItem.file.name),
            importado: true,
            origem_importacao: 'arquivo',
          } as any,
        });
      } catch (docUpdateError) {
        console.error('[import][document_update_failed]', docUpdateError);
        setItem(activeItem.id, (item) => ({
          ...item,
          warnings: item.warnings.concat('A reserva foi salva, mas não foi possível atualizar o documento de importação.'),
        }));
      }
    }

    setItemStep(activeItem.id, 'saving', 'completed');

    const stayGaps = calculateStayCoverageGaps(
      staysAfter,
      currentTripDataRange.data_inicio ?? null,
      currentTripDataRange.data_fim ?? null,
    );
    const transportGaps = calculateTransportCoverageGaps(staysAfter, transportsAfter, flightsAfter);

    const nextSteps: string[] = [];
    if (stayGaps.length > 0) {
      const firstStayGap = stayGaps[0];
      nextSteps.push(`Hospedagem pendente: ${toDateLabel(firstStayGap.start)}-${toDateLabel(firstStayGap.end)}.`);
    } else {
      nextSteps.push('Hospedagens cobertas no período atual.');
    }

    if (transportGaps.length > 0) {
      const firstTransportGap = transportGaps[0];
      nextSteps.push(`Transporte pendente: ${firstTransportGap.from} → ${firstTransportGap.to}.`);
    } else {
      nextSteps.push('Trechos entre cidades cobertos.');
    }

    const summary: ImportSummary = {
      type: activeItem.scope === 'outside_scope' ? 'documento' : reviewState?.type ?? activeItem.identifiedType ?? 'transporte',
      title,
      subtitle,
      amount,
      currency,
      estimatedBrl: amount != null ? convertToBrl(amount, currency) : null,
      checkIn,
      checkOut,
      nights: diffNights(checkIn, checkOut),
      stayGapCount: stayGaps.length,
      transportGapCount: transportGaps.length,
      nextSteps,
    };

    setItem(activeItem.id, (item) => ({
      ...item,
      status: 'saved',
      summary,
      hotelPhotos: photos,
      photoIndex: 0,
      visualSteps: {
        ...item.visualSteps,
        saving: 'completed',
        done: 'completed',
      },
    }));

    toast.success(
      activeItem.scope === 'outside_scope'
        ? 'Arquivo salvo em documentos como fora de escopo.'
        : `${typeLabel(reviewState?.type)} salvo com sucesso.`,
    );

    await trackProductEvent({
      eventName: 'import_confirmed',
      featureKey: 'ff_ai_import_enabled',
      viagemId: currentTripId,
      metadata: {
        fileName: activeItem.file.name,
        scope: activeItem.scope,
        type: reviewState?.type ?? activeItem.identifiedType ?? null,
      },
    });

    if (currentTripId) {
      const webhookPayload = {
        itemType: reviewState?.type ?? activeItem.identifiedType ?? 'documento',
        scope: activeItem.scope,
        fileName: activeItem.file.name,
        documentId: activeItem.documentId,
      };
      const webhook = await dispatchTripWebhook({
        eventType: 'import.confirmed',
        viagemId: currentTripId,
        payload: webhookPayload,
      });
      if (webhook.error) {
        await trackProductEvent({
          eventName: 'webhook_dispatched',
          featureKey: 'ff_webhooks_enabled',
          viagemId: currentTripId,
          metadata: {
            status: 'failed',
            source: 'import.confirmed',
            error: webhook.error,
          },
        });
        setItem(activeItem.id, (item) => ({
          ...item,
          warnings: item.warnings.concat('Reserva salva, mas o webhook de integração não pôde ser enviado.'),
        }));
      } else {
        await trackProductEvent({
          eventName: 'webhook_dispatched',
          featureKey: 'ff_webhooks_enabled',
          viagemId: currentTripId,
          metadata: {
            status: 'success',
            source: 'import.confirmed',
          },
        });
      }
    }
    return { ok: true };
  } catch (error) {
    console.error('[import][save_failure]', error);
    setItem(activeItem.id, (item) => ({
      ...item,
      status: 'needs_confirmation',
      warnings: item.warnings.concat(error instanceof Error ? error.message : 'Falha ao salvar item.'),
      visualSteps: {
        ...item.visualSteps,
        saving: 'failed',
        done: 'failed',
      },
    }));
    toast.error('Falha ao confirmar e salvar este item.');
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Falha ao salvar item.',
    };
  }
}
