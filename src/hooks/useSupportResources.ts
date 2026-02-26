import { Dispatch, SetStateAction, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { useDocuments, useLuggage, usePreparativos, useTravelers } from '@/hooks/useTripModules';
import { emptySupportForms, SupportForms } from '@/pages/dashboardHelpers';

type DocumentsModule = ReturnType<typeof useDocuments>;
type LuggageModule = ReturnType<typeof useLuggage>;
type TravelersModule = ReturnType<typeof useTravelers>;
type PreparativosModule = ReturnType<typeof usePreparativos>;

type UseSupportResourcesOptions = {
  canEditTrip: boolean;
  documentsModule: DocumentsModule;
  luggageModule: LuggageModule;
  travelersModule: TravelersModule;
  prepModule: PreparativosModule;
};

type UseSupportResourcesResult = {
  supportForms: SupportForms;
  setSupportForms: Dispatch<SetStateAction<SupportForms>>;
  openingDocumentPath: string | null;
  downloadingDocumentPath: string | null;
  createDocument: () => Promise<void>;
  removeDocument: (id: string) => Promise<void>;
  openSupportDocument: (path: string | null) => Promise<void>;
  downloadSupportDocument: (path: string | null, fileName?: string | null) => Promise<void>;
  createLuggageItem: () => Promise<void>;
  toggleLuggageChecked: (item: Tables<'bagagem'>) => Promise<void>;
  removeLuggageItem: (id: string) => Promise<void>;
  createTraveler: () => Promise<void>;
  removeTraveler: (id: string) => Promise<void>;
  createPrepItem: () => Promise<void>;
  togglePrepDone: (item: Tables<'preparativos'>) => Promise<void>;
  removePrepItem: (id: string) => Promise<void>;
};

export function useSupportResources({
  canEditTrip,
  documentsModule,
  luggageModule,
  travelersModule,
  prepModule,
}: UseSupportResourcesOptions): UseSupportResourcesResult {
  const [supportForms, setSupportForms] = useState<SupportForms>(emptySupportForms);
  const [openingDocumentPath, setOpeningDocumentPath] = useState<string | null>(null);
  const [downloadingDocumentPath, setDownloadingDocumentPath] = useState<string | null>(null);

  const ensureCanEdit = () => {
    if (canEditTrip) return true;
    toast.error('Você está com papel de visualização nesta viagem.');
    return false;
  };

  const resolveDocumentUrl = async (path: string) => {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    const { data, error } = await supabase.storage.from('imports').createSignedUrl(path, 60 * 15);
    if (error || !data?.signedUrl) {
      throw new Error(error?.message || 'Não foi possível abrir o comprovante.');
    }

    return data.signedUrl;
  };

  const createDocument = async () => {
    if (!ensureCanEdit()) return;
    if (!supportForms.documentoNome.trim()) return;
    await documentsModule.create({
      nome: supportForms.documentoNome.trim(),
      tipo: supportForms.documentoTipo.trim() || null,
      arquivo_url: supportForms.documentoUrl.trim() || null,
    });
    setSupportForms((state) => ({ ...state, documentoNome: '', documentoTipo: '', documentoUrl: '' }));
  };

  const removeDocument = async (id: string) => {
    if (!ensureCanEdit()) return;
    await documentsModule.remove(id);
  };

  const openSupportDocument = async (path: string | null) => {
    if (!path) {
      toast.error('Documento sem caminho disponível.');
      return;
    }

    setOpeningDocumentPath(path);
    try {
      const url = await resolveDocumentUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('[support-resources][document_open_failure]', { path, error });
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir o documento.');
    } finally {
      setOpeningDocumentPath((current) => (current === path ? null : current));
    }
  };

  const downloadSupportDocument = async (path: string | null, fileName?: string | null) => {
    if (!path) {
      toast.error('Documento sem caminho disponível.');
      return;
    }

    setDownloadingDocumentPath(path);
    try {
      const url = await resolveDocumentUrl(path);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'comprovante';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('[support-resources][document_download_failure]', { path, error });
      toast.error(error instanceof Error ? error.message : 'Não foi possível baixar o documento.');
    } finally {
      setDownloadingDocumentPath((current) => (current === path ? null : current));
    }
  };

  const createLuggageItem = async () => {
    if (!ensureCanEdit()) return;
    if (!supportForms.bagagemItem.trim()) return;
    await luggageModule.create({
      item: supportForms.bagagemItem.trim(),
      quantidade: Number(supportForms.bagagemQuantidade || 1),
      conferido: false,
    });
    setSupportForms((state) => ({ ...state, bagagemItem: '', bagagemQuantidade: '1' }));
  };

  const toggleLuggageChecked = async (item: Tables<'bagagem'>) => {
    if (!ensureCanEdit()) return;
    await luggageModule.update({
      id: item.id,
      updates: { conferido: !item.conferido },
    });
  };

  const removeLuggageItem = async (id: string) => {
    if (!ensureCanEdit()) return;
    await luggageModule.remove(id);
  };

  const createTraveler = async () => {
    if (!ensureCanEdit()) return;
    if (!supportForms.viajanteNome.trim()) return;
    await travelersModule.create({
      nome: supportForms.viajanteNome.trim(),
      email: supportForms.viajanteEmail.trim() || null,
      telefone: supportForms.viajanteTelefone.trim() || null,
    });
    setSupportForms((state) => ({ ...state, viajanteNome: '', viajanteEmail: '', viajanteTelefone: '' }));
  };

  const removeTraveler = async (id: string) => {
    if (!ensureCanEdit()) return;
    await travelersModule.remove(id);
  };

  const createPrepItem = async () => {
    if (!ensureCanEdit()) return;
    if (!supportForms.preparativoTitulo.trim()) return;
    await prepModule.create({
      titulo: supportForms.preparativoTitulo.trim(),
      descricao: supportForms.preparativoDescricao.trim() || null,
      concluido: false,
    });
    setSupportForms((state) => ({ ...state, preparativoTitulo: '', preparativoDescricao: '' }));
  };

  const togglePrepDone = async (item: Tables<'preparativos'>) => {
    if (!ensureCanEdit()) return;
    await prepModule.update({
      id: item.id,
      updates: { concluido: !item.concluido },
    });
  };

  const removePrepItem = async (id: string) => {
    if (!ensureCanEdit()) return;
    await prepModule.remove(id);
  };

  return {
    supportForms,
    setSupportForms,
    openingDocumentPath,
    downloadingDocumentPath,
    createDocument,
    removeDocument,
    openSupportDocument,
    downloadSupportDocument,
    createLuggageItem,
    toggleLuggageChecked,
    removeLuggageItem,
    createTraveler,
    removeTraveler,
    createPrepItem,
    togglePrepDone,
    removePrepItem,
  };
}
