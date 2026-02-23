import { cn } from '@/lib/utils';
import { BrandVariant, brandTheme } from '@/brand/brand-config';

type BrandLogoProps = {
  variant?: BrandVariant;
  className?: string;
};

export function BrandLogo({ variant = 'co-brand', className }: BrandLogoProps) {
  if (variant === 'latam-airlines') {
    return (
      <img
        src={brandTheme.logos.latamAirlines}
        alt="LATAM Airlines"
        className={cn('h-9 w-auto object-contain sm:h-10', className)}
        loading="lazy"
      />
    );
  }

  if (variant === 'latam-pass') {
    return (
      <div
        className={cn(
          'inline-flex items-center rounded-lg bg-[#09014F] px-2 py-1',
          className,
        )}
      >
        <img
          src={brandTheme.logos.latamPass}
          alt="LATAM Pass"
          className="h-7 w-auto object-contain sm:h-8"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border border-border/60 bg-white/95 px-2 py-1 shadow-sm',
        className,
      )}
      aria-label="LATAM e LATAM Pass"
    >
      <img
        src={brandTheme.logos.latamAirlines}
        alt="LATAM Airlines"
        className="h-6 w-auto object-contain sm:h-7"
        loading="lazy"
      />
      <span className="h-5 w-px bg-border/80" />
      <div className="rounded-md bg-[#09014F] px-1.5 py-0.5">
        <img
          src={brandTheme.logos.latamPass}
          alt="LATAM Pass"
          className="h-4 w-auto object-contain sm:h-5"
          loading="lazy"
        />
      </div>
    </div>
  );
}

