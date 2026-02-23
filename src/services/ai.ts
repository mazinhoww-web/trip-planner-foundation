import { supabase } from '@/integrations/supabase/client';
import { parseFunctionError } from '@/services/errors';

type StayTipsInput = {
  hotelName?: string | null;
  location?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  tripDestination?: string | null;
  flightOrigin?: string | null;
  flightDestination?: string | null;
  userHomeCity?: string | null;
};

export type StayTipsOutput = {
  dica_viagem: string | null;
  como_chegar: string | null;
  atracoes_proximas: string | null;
  restaurantes_proximos: string | null;
  dica_ia: string | null;
};

type SuggestedRestaurant = {
  nome: string;
  cidade: string | null;
  tipo: string | null;
  faixa_preco: string | null;
  especialidade: string | null;
  bairro_regiao: string | null;
};

type SuggestRestaurantsInput = {
  city?: string | null;
  location?: string | null;
  tripDestination?: string | null;
};

type FunctionResult<T> = {
  data: T | null;
  error: string | null;
  fromFallback: boolean;
};

function logAi(event: string, details: Record<string, unknown>) {
  // Logs básicos para troubleshooting de IA/OCR conforme anexos.
  console.info('[ai-log]', event, details);
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function fallbackStayTips(input: StayTipsInput): StayTipsOutput {
  const loc = trimOrNull(input.location) ?? trimOrNull(input.tripDestination) ?? 'sua hospedagem';
  const origin = trimOrNull(input.flightOrigin);

  return {
    dica_viagem: `Verifique horários de check-in/check-out diretamente com ${loc}. Salve o endereço no Google Maps offline antes de viajar.`,
    como_chegar: origin
      ? `Pesquise rotas de ${origin} até ${loc} no Google Maps ou Rome2Rio para opções de transporte com preços.`
      : `Pesquise rotas até ${loc} no Google Maps ou Rome2Rio para opções de transporte com preços.`,
    atracoes_proximas: `Busque "atrações perto de ${loc}" no Google Maps para ver pontos turísticos com avaliações reais.`,
    restaurantes_proximos: `Busque "restaurantes perto de ${loc}" no Google Maps para ver opções com avaliações e preços.`,
    dica_ia: 'Dicas automáticas indisponíveis no momento. Tente novamente em alguns minutos para obter sugestões personalizadas.',
  };
}

function fallbackRestaurants(input: SuggestRestaurantsInput): SuggestedRestaurant[] {
  const city = trimOrNull(input.city) ?? trimOrNull(input.location) ?? trimOrNull(input.tripDestination) ?? 'Cidade da viagem';

  return [
    { nome: `Sabores do Centro (${city})`, cidade: city, tipo: 'Brasileira', faixa_preco: '$$', especialidade: 'Pratos regionais', bairro_regiao: 'Centro' },
    { nome: `Bistrô da Praça (${city})`, cidade: city, tipo: 'Contemporânea', faixa_preco: '$$$', especialidade: 'Menu executivo', bairro_regiao: 'Região central' },
    { nome: `Cantina Local (${city})`, cidade: city, tipo: 'Italiana', faixa_preco: '$$', especialidade: 'Massas frescas', bairro_regiao: 'Bairro turístico' },
    { nome: `Mercado & Cozinha (${city})`, cidade: city, tipo: 'Variada', faixa_preco: '$', especialidade: 'Pratos rápidos', bairro_regiao: 'Área comercial' },
    { nome: `Brasa e Grelha (${city})`, cidade: city, tipo: 'Churrasco', faixa_preco: '$$$', especialidade: 'Carnes e acompanhamentos', bairro_regiao: 'Zona gastronômica' },
  ];
}

async function invokeWithSingleRetry<T>(
  functionName: string,
  payload: Record<string, unknown>,
): Promise<{ data: T | null; error: string | null }> {
  const run = async () => {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: payload,
    });

    if (error) {
      throw new Error(parseFunctionError(data ?? error, 'Falha na função remota.'));
    }

    if ((data as { error?: unknown } | null)?.error) {
      throw new Error(parseFunctionError(data, 'Falha na função remota.'));
    }

    return data as T;
  };

  try {
    return { data: await run(), error: null };
  } catch (firstError) {
    logAi('retry_once', { functionName, reason: (firstError as Error).message });
    try {
      return { data: await run(), error: null };
    } catch (secondError) {
      return { data: null, error: (secondError as Error).message || 'Falha ao chamar IA.' };
    }
  }
}

export async function generateStayTips(input: StayTipsInput): Promise<FunctionResult<StayTipsOutput>> {
  const payload = {
    hotelName: trimOrNull(input.hotelName),
    location: trimOrNull(input.location),
    checkIn: trimOrNull(input.checkIn),
    checkOut: trimOrNull(input.checkOut),
    tripDestination: trimOrNull(input.tripDestination),
    flightOrigin: trimOrNull(input.flightOrigin),
    flightDestination: trimOrNull(input.flightDestination),
    userHomeCity: trimOrNull(input.userHomeCity),
  };

  const response = await invokeWithSingleRetry<{ data?: StayTipsOutput; error?: string }>('generate-tips', payload);

  if (response.error || !response.data?.data) {
    logAi('generate_tips_fallback', {
      error: response.error,
      location: payload.location,
      hotelName: payload.hotelName,
    });
    return {
      data: fallbackStayTips(payload),
      error: response.error ?? 'Não foi possível usar IA neste momento.',
      fromFallback: true,
    };
  }

  const data = response.data.data;
  const normalized: StayTipsOutput = {
    dica_viagem: trimOrNull(data.dica_viagem),
    como_chegar: trimOrNull(data.como_chegar),
    atracoes_proximas: trimOrNull(data.atracoes_proximas),
    restaurantes_proximos: trimOrNull(data.restaurantes_proximos),
    dica_ia: trimOrNull(data.dica_ia),
  };

  return { data: normalized, error: null, fromFallback: false };
}

export async function suggestRestaurants(input: SuggestRestaurantsInput): Promise<FunctionResult<SuggestedRestaurant[]>> {
  const payload = {
    city: trimOrNull(input.city),
    location: trimOrNull(input.location),
    tripDestination: trimOrNull(input.tripDestination),
  };

  const response = await invokeWithSingleRetry<{ data?: { items?: SuggestedRestaurant[] }; error?: string }>(
    'suggest-restaurants',
    payload,
  );

  const items = response.data?.data?.items ?? [];

  if (response.error || items.length === 0) {
    logAi('suggest_restaurants_fallback', {
      error: response.error,
      city: payload.city,
      location: payload.location,
    });
    return {
      data: fallbackRestaurants(payload),
      error: response.error ?? 'Não foi possível gerar restaurantes pela IA.',
      fromFallback: true,
    };
  }

  const normalized = items
    .map((item) => ({
      nome: trimOrNull(item.nome) ?? 'Restaurante sugerido',
      cidade: trimOrNull(item.cidade),
      tipo: trimOrNull(item.tipo),
      faixa_preco: trimOrNull(item.faixa_preco),
      especialidade: trimOrNull(item.especialidade),
      bairro_regiao: trimOrNull(item.bairro_regiao),
    }))
    .slice(0, 6);

  return { data: normalized, error: null, fromFallback: false };
}

// ---------------------------------------------------------------------------
// Generate trip tasks with AI
// ---------------------------------------------------------------------------

type GenerateTasksInput = {
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  userHomeCity?: string | null;
  flights?: Array<{ origem?: string | null; destino?: string | null }>;
  stays?: Array<{ localizacao?: string | null; check_in?: string | null }>;
  existingTasks?: string[];
};

export type SuggestedTask = {
  titulo: string;
  categoria: string;
  prioridade: 'baixa' | 'media' | 'alta';
};

export async function generateTripTasks(input: GenerateTasksInput): Promise<FunctionResult<SuggestedTask[]>> {
  const response = await invokeWithSingleRetry<{ data?: { tasks?: SuggestedTask[] }; error?: string }>(
    'generate-tasks',
    input as Record<string, unknown>,
  );

  const tasks = response.data?.data?.tasks ?? [];

  if (response.error || tasks.length === 0) {
    logAi('generate_tasks_fallback', { error: response.error });
    return {
      data: [],
      error: response.error ?? 'Não foi possível gerar tarefas com IA.',
      fromFallback: true,
    };
  }

  return { data: tasks, error: null, fromFallback: false };
}

// ---------------------------------------------------------------------------
// Generate itinerary with AI
// ---------------------------------------------------------------------------

type GenerateItineraryInput = {
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  userHomeCity?: string | null;
  stays?: Array<{
    nome?: string | null;
    localizacao?: string | null;
    check_in?: string | null;
    check_out?: string | null;
    atracoes_proximas?: string | null;
    restaurantes_proximos?: string | null;
    dica_viagem?: string | null;
  }>;
  flights?: Array<{ origem?: string | null; destino?: string | null; data?: string | null }>;
  transports?: Array<{ tipo?: string | null; origem?: string | null; destino?: string | null; data?: string | null }>;
  restaurants?: Array<{ nome?: string | null; cidade?: string | null; tipo?: string | null }>;
};

export type ItineraryItem = {
  dia: string;
  ordem: number;
  titulo: string;
  descricao: string | null;
  horario_sugerido: string | null;
  categoria: string;
  localizacao: string | null;
  link_maps: string | null;
};

export async function generateItinerary(input: GenerateItineraryInput): Promise<FunctionResult<ItineraryItem[]>> {
  const response = await invokeWithSingleRetry<{ data?: { items?: ItineraryItem[] }; error?: string }>(
    'generate-itinerary',
    input as Record<string, unknown>,
  );

  const items = response.data?.data?.items ?? [];

  if (response.error || items.length === 0) {
    logAi('generate_itinerary_fallback', { error: response.error });
    return {
      data: [],
      error: response.error ?? 'Não foi possível gerar roteiro com IA.',
      fromFallback: true,
    };
  }

  return { data: items, error: null, fromFallback: false };
}
