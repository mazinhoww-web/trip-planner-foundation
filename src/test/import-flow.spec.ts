import { describe, expect, it } from 'vitest';
import { findImportedDocumentByHash, withImportHash } from '@/services/importPersist';
import { ArceeExtractionPayload } from '@/services/importPipeline';

const canonical: ArceeExtractionPayload = {
  metadata: {
    tipo: 'Voo',
    confianca: 88,
    status: 'Pendente',
  },
  dados_principais: {
    nome_exibicao: 'LATAM',
    provedor: 'LATAM',
    codigo_reserva: 'ABC123',
    passageiro_hospede: 'Teste',
    data_inicio: '2026-04-01',
    hora_inicio: '10:00',
    data_fim: '2026-04-01',
    hora_fim: '12:00',
    origem: 'GRU',
    destino: 'FLN',
  },
  financeiro: {
    valor_total: 100,
    moeda: 'BRL',
    metodo: 'Cartão',
    pontos_utilizados: 0,
  },
  enriquecimento_ia: {
    dica_viagem: null,
    como_chegar: null,
    atracoes_proximas: null,
    restaurantes_proximos: null,
  },
};

describe('import persistence helpers', () => {
  it('adds file hash metadata to canonical payload', () => {
    const patched = withImportHash(canonical, 'hash123', 'ticket.pdf');
    expect((patched?.metadata as unknown as Record<string, string>).arquivo_hash).toBe('hash123');
    expect((patched?.metadata as unknown as Record<string, string>).arquivo_nome).toBe('ticket.pdf');
  });

  it('finds already imported document by hash', () => {
    const docs = [
      {
        id: '1',
        nome: 'antigo.pdf',
        importado: true,
        extracao_payload: {
          metadata: {
            arquivo_hash: 'hash123',
          },
        },
      },
      {
        id: '2',
        nome: 'outro.pdf',
        importado: false,
        extracao_payload: null,
      },
    ] as any;

    const duplicated = findImportedDocumentByHash(docs, 'hash123');
    expect(duplicated?.id).toBe('1');
    expect(findImportedDocumentByHash(docs, 'missing')).toBeNull();
  });
});
