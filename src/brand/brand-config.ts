export type BrandVariant = 'latam-airlines' | 'latam-pass' | 'co-brand';

export type BrandTheme = {
  id: 'latam-pass-cobrand';
  name: string;
  logos: {
    latamAirlines: string;
    latamPass: string;
  };
  colors: {
    navy: string;
    navyDeep: string;
    magenta: string;
    danger: string;
    success: string;
  };
};

export const brandTheme: BrandTheme = {
  id: 'latam-pass-cobrand',
  name: 'LATAM + LATAM Pass',
  logos: {
    latamAirlines: '/assets/brand/latam/latam-airlines-logo.svg',
    latamPass: '/assets/brand/latam/latam-pass-logo.png',
  },
  colors: {
    navy: '#1B0088',
    navyDeep: '#09014F',
    magenta: '#ED1650',
    danger: '#C8102E',
    success: '#00875A',
  },
};

