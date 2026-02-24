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
    <Card className="mb-6 overflow-hidden border-primary/20 shadow-lg shadow-primary/10 sm:mb-8">
      <div className="relative min-h-[180px] sm:min-h-[240px] lg:min-h-[260px]">
        <img
          src={coverImage}
          alt={`Capa da viagem ${name}`}
          className="h-[180px] w-full object-cover sm:h-[240px] lg:h-[260px]"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09014F]/90 via-[#09014F]/42 to-transparent" />

        <div className="absolute left-3 top-3 sm:left-6 sm:top-6">
          <BrandLogo variant="latam-pass" className="origin-top-left scale-90 sm:scale-100" />
        </div>

        <div className="absolute inset-x-0 bottom-0 p-3 text-white sm:p-6">
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:gap-2 sm:text-xs">
            <span className="rounded-full bg-white/20 px-3 py-1 backdrop-blur">
              {status.replace('_', ' ')}
            </span>
            {daysUntilTrip != null && (
              <span className="rounded-full bg-[#ED1650]/90 px-3 py-1 text-white">
                Em {daysUntilTrip} dias
              </span>
            )}
          </div>
          <h2 className="mt-2 line-clamp-2 text-xl font-bold font-display sm:text-3xl">{name}</h2>
          <p className="mt-1 text-[11px] text-white/85 sm:text-sm">
            <MapPin className="mr-1 inline h-4 w-4" />
            {destinationLabel}
            {dateRangeLabel ? ` · ${dateRangeLabel}` : ''}
          </p>
        </div>
      </div>
    </Card>
  );
}
