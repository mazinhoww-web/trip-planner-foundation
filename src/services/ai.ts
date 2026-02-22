import { supabase } from '@/integrations/supabase/client';

type StayTipsInput = {
  hotelName?: string | null;
  location?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  tripDestination?: string | null;
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
  const baseRegion = trimOrNull(input.location) ?? trimOrNull(input.tripDestination) ?? 'a região da sua hospedagem';

  return {
    dica_viagem: `Confirme check-in/check-out e prefira deslocamentos fora do horário de pico em ${baseRegion}.`,
    como_chegar: `Use apps de mobilidade ou transporte público a partir do aeroporto/estação principal até ${baseRegion}.`,
    atracoes_proximas: `Pesquise no mapa por pontos culturais e parques no entorno de ${baseRegion}.`,
    restaurantes_proximos: `Busque opções de culinária local, café da manhã e jantar no bairro de ${baseRegion}.`,
    dica_ia: 'Fallback ativo: revise as sugestões no mapa e confirme horários diretamente com os estabelecimentos.',
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
      throw new Error(error.message || 'Falha na função remota.');
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
