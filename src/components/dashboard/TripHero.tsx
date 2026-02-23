import { Card } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandLogo';

type TripHeroProps = {
  name: string;
  status: string;
  daysUntilTrip: number | null;
  destinationLabel: string;
  dateRangeLabel: string;
  coverImage: string;
};

export function TripHero({
  name,
  status,
  daysUntilTrip,
  destinationLabel,
  dateRangeLabel,
  coverImage,
}: TripHeroProps) {
  return (
    <Card className="mb-8 overflow-hidden border-primary/20 shadow-lg shadow-primary/10">
      <div className="relative min-h-[200px] sm:min-h-[240px]">
        <img
          src={coverImage}
          alt={`Capa da viagem ${name}`}
          className="h-[200px] w-full object-cover sm:h-[240px]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09014F]/90 via-[#09014F]/42 to-transparent" />

        <div className="absolute left-4 top-4 sm:left-6 sm:top-6">
          <BrandLogo variant="latam-pass" />
        </div>

        <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">
              {status.replace('_', ' ')}
            </span>
            {daysUntilTrip != null && (
              <span className="rounded-full bg-[#ED1650]/90 px-3 py-1 text-white">
                Em {daysUntilTrip} dias
              </span>
            )}
          </div>
          <h2 className="mt-2 text-2xl font-bold font-display sm:text-3xl">{name}</h2>
          <p className="mt-1 text-xs text-white/85 sm:text-sm">
            <MapPin className="mr-1 inline h-4 w-4" />
            {destinationLabel}
            {dateRangeLabel ? ` · ${dateRangeLabel}` : ''}
          </p>
        </div>
      </div>
    </Card>
  );
}
