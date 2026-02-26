import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Compass, Sparkles } from 'lucide-react';

type OnboardingStep = {
  title: string;
  description: string;
  tab: string;
  actionLabel: string;
};

type OnboardingWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigateTab: (tab: string) => void;
  onComplete: () => void;
};

const STEPS: OnboardingStep[] = [
  {
    title: 'Visão geral da viagem',
    description: 'Acompanhe próximos eventos, cobertura de hospedagem e transporte, além dos cartões de resumo.',
    tab: 'visao',
    actionLabel: 'Abrir Dashboard',
  },
  {
    title: 'Importe reservas em lote',
    description: 'Use a importação inteligente para classificar PDFs e confirmar os dados antes do salvamento.',
    tab: 'hospedagens',
    actionLabel: 'Ir para Importação',
  },
  {
    title: 'Convide quem viaja com você',
    description: 'Na aba Apoio, owner pode enviar convites e definir papéis de colaboração.',
    tab: 'apoio',
    actionLabel: 'Abrir Apoio',
  },
  {
    title: 'Feche o orçamento',
    description: 'Revise despesas reais, variação de orçamento e exporte relatórios conforme o plano.',
    tab: 'orcamento',
    actionLabel: 'Abrir Orçamento',
  },
];

export function OnboardingWizard({
  open,
  onOpenChange,
  onNavigateTab,
  onComplete,
}: OnboardingWizardProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = useMemo(() => STEPS[Math.min(stepIndex, STEPS.length - 1)], [stepIndex]);
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;

  const closeAndPersist = () => {
    onComplete();
    onOpenChange(false);
  };

  const nextStep = () => {
    if (isLast) {
      closeAndPersist();
      return;
    }
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const previousStep = () => {
    if (isFirst) return;
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const openStepTab = () => {
    onNavigateTab(step.tab);
    closeAndPersist();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setStepIndex(0);
      }}
    >
      <DialogContent className="w-[calc(100vw-1rem)] max-w-xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Compass className="h-4 w-4" />
            </span>
            Tour rápido do Trip Planner
          </DialogTitle>
          <DialogDescription>
            Quatro passos para começar com dados reais e colaboração ativa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline">
              Etapa {stepIndex + 1} de {STEPS.length}
            </Badge>
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">{step.title}</h3>
          <p className="text-sm text-muted-foreground">{step.description}</p>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button variant="outline" onClick={closeAndPersist}>
              Pular tour
            </Button>
            <Button variant="outline" onClick={openStepTab}>
              {step.actionLabel}
            </Button>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="ghost" onClick={previousStep} disabled={isFirst} className="flex-1 sm:flex-none">
              Voltar
            </Button>
            <Button onClick={nextStep} className="flex-1 sm:flex-none">
              {isLast ? 'Concluir' : 'Próximo'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
