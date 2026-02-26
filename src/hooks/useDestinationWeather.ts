import { useQuery } from '@tanstack/react-query';
import { fetchDestinationWeather } from '@/services/weather';

export function useDestinationWeather(destination: string | null | undefined, tripStartDate: string | null | undefined) {
  const cleanedDestination = destination?.trim() ?? '';

  return useQuery({
    queryKey: ['destination-weather', cleanedDestination, tripStartDate ?? null],
    enabled: cleanedDestination.length > 0,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    retry: 1,
    queryFn: async () => {
      if (!cleanedDestination) return null;
      return fetchDestinationWeather(cleanedDestination, tripStartDate ?? null);
    },
  });
}
