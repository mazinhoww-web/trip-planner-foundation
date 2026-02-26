import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tables } from '@/integrations/supabase/types';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';

const flight = (partial: Partial<Tables<'voos'>>) => partial as Tables<'voos'>;
const stay = (partial: Partial<Tables<'hospedagens'>>) => partial as Tables<'hospedagens'>;
const transport = (partial: Partial<Tables<'transportes'>>) => partial as Tables<'transportes'>;
const task = (partial: Partial<Tables<'tarefas'>>) => partial as Tables<'tarefas'>;
const expense = (partial: Partial<Tables<'despesas'>>) => partial as Tables<'despesas'>;
const restaurant = (partial: Partial<Tables<'restaurantes'>>) => partial as Tables<'restaurantes'>;
const document = (partial: Partial<Tables<'documentos'>>) => partial as Tables<'documentos'>;

describe('useDashboardMetrics', () => {
  it('computes filters and budget totals using active reservations', () => {
    const { result } = renderHook(() =>
      useDashboardMetrics({
        currentTrip: { data_inicio: '2026-04-01', data_fim: '2026-04-11' } as Tables<'viagens'>,
        flights: [
          flight({
            id: 'f1',
            numero: 'LA3303',
            companhia: 'LATAM',
            origem: 'FLN',
            destino: 'GRU',
            data: '2026-04-02T10:00:00Z',
            status: 'confirmado',
            valor: 500,
            moeda: 'BRL',
          }),
          flight({
            id: 'f2',
            numero: 'G3200',
            companhia: 'GOL',
            origem: 'GRU',
            destino: 'FLN',
            data: '2026-04-10T18:00:00Z',
            status: 'cancelado',
            valor: 320,
            moeda: 'BRL',
          }),
        ],
        stays: [stay({ id: 'h1', nome: 'Hotel Centro', localizacao: 'Sao Paulo', status: 'confirmado', valor: 900, moeda: 'BRL', check_in: '2026-04-03', check_out: '2026-04-05' })],
        transports: [transport({ id: 't1', tipo: 'Trem', origem: 'GRU', destino: 'Centro', data: '2026-04-03', status: 'confirmado', valor: 100, moeda: 'BRL' })],
        tasks: [task({ id: 'ta1', titulo: 'Arrumar mala', categoria: 'Preparativos' })],
        expenses: [expense({ id: 'e1', categoria: 'Alimentacao', valor: 250, moeda: 'BRL', data: '2026-04-04' })],
        restaurants: [restaurant({ id: 'r1', salvo: true }), restaurant({ id: 'r2', salvo: false })],
        documents: [],
        selectedStay: null,
        flightSearch: 'latam',
        flightStatus: 'todos',
        staySearch: '',
        stayStatus: 'todos',
        transportSearch: '',
        transportStatus: 'todos',
        taskSearch: 'mala',
        userHomeCity: null,
        dismissedGapKeys: new Set<string>(),
      }),
    );

    expect(result.current.flightsFiltered).toHaveLength(1);
    expect(result.current.tasksFiltered).toHaveLength(1);
    expect(result.current.realTotal).toBe(250);
    expect(result.current.estimadoTotal).toBe(1500);
    expect(result.current.variacaoTotal).toBe(-1250);
    expect(result.current.restaurantsFavorites).toHaveLength(1);
    expect(result.current.inferredHomeCity).toBe('FLN');
    expect(result.current.tripCountdown).not.toBeNull();
    expect(result.current.smartChecklistItems.some((item) => item.key === 'task-pending')).toBe(true);
    expect(result.current.smartChecklistItems.some((item) => item.key === 'documents-missing')).toBe(true);
  });

  it('respects dismissed stay gaps and creates trip header date range', () => {
    const dismissed = new Set<string>(['stay-gap-2026-01-01-2026-01-02']);
    const { result } = renderHook(() =>
      useDashboardMetrics({
        currentTrip: { data_inicio: '2026-01-01', data_fim: '2026-01-06' } as Tables<'viagens'>,
        flights: [],
        stays: [stay({ id: 'h1', nome: 'Airbnb', localizacao: 'Paris', status: 'confirmado', check_in: '2026-01-03', check_out: '2026-01-05' })],
        transports: [],
        tasks: [],
        expenses: [],
        restaurants: [],
        documents: [document({ id: 'd1', nome: 'voucher-airbnb.pdf', arquivo_url: 'https://x/voucher-airbnb.pdf' })],
        selectedStay: stay({ id: 'h1', nome: 'Airbnb', localizacao: 'Paris' }),
        flightSearch: '',
        flightStatus: 'todos',
        staySearch: '',
        stayStatus: 'todos',
        transportSearch: '',
        transportStatus: 'todos',
        taskSearch: '',
        userHomeCity: 'RIO',
        dismissedGapKeys: dismissed,
      }),
    );

    expect(result.current.stayCoverageGaps.length).toBeGreaterThan(0);
    expect(result.current.stayGapLines).toHaveLength(1);
    expect(result.current.selectedStayDocuments).toHaveLength(1);
    expect(result.current.heroDateRangeLabel).toContain('2026');
    expect(result.current.heroDateRangeLabel).toContain('-');
    expect(result.current.inferredHomeCity).toBe('RIO');
    expect(result.current.smartChecklistItems.some((item) => item.key === 'stay-coverage-gap')).toBe(true);
  });
});
