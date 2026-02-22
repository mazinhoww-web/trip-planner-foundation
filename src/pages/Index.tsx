import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plane, Shield, Globe, Zap } from 'lucide-react';

const features = [
  { icon: Plane, title: 'Voos & Reservas', desc: 'Gerencie todos os seus voos e reservas em um só lugar.' },
  { icon: Shield, title: 'Seguro & Privado', desc: 'Seus dados isolados por usuário com segurança real.' },
  { icon: Globe, title: 'Multi-destino', desc: 'Planeje viagens complexas com múltiplos destinos.' },
  { icon: Zap, title: 'IA Integrada', desc: 'Importação inteligente e dicas personalizadas.' },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="relative mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-32 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Plane className="h-8 w-8" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl" style={{ fontFamily: 'var(--font-display)' }}>
            TripPlanner
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Planeje, organize e aproveite suas viagens com dados reais, segurança e inteligência artificial.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="text-base font-semibold px-8">
              <Link to="/signup">Começar Grátis</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base px-8">
              <Link to="/login">Entrar</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border/50 bg-card p-6 transition-shadow hover:shadow-md">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
