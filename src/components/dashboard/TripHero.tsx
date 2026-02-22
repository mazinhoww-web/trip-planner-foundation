import { Card } from '@/components/ui/card';
import { MapPin } from 'lucide-react';

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
    <Card className="mb-8 overflow-hidden border-border/60">
      <div className="relative min-h-[240px]">
        <img
          src={coverImage}
          alt={`Capa da viagem ${name}`}
          className="h-[240px] w-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-white/25 px-3 py-1 backdrop-blur">
              {status.replace('_', ' ')}
            </span>
            {daysUntilTrip != null && (
              <span className="rounded-full bg-white/25 px-3 py-1 backdrop-blur">
                Em {daysUntilTrip} dias
              </span>
            )}
          </div>
          <h2 className="mt-2 text-3xl font-bold font-display">{name}</h2>
          <p className="mt-1 text-sm text-white/85">
            <MapPin className="mr-1 inline h-4 w-4" />
            {destinationLabel}
            {dateRangeLabel ? ` · ${dateRangeLabel}` : ''}
          </p>
        </div>
      </div>
    </Card>
  );
}
