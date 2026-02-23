import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';

type TripTopActionsProps = {
  isReconciling: boolean;
  onReconcile: () => void;
  children?: ReactNode;
};

export function TripTopActions({ isReconciling, onReconcile, children }: TripTopActionsProps) {
  return (
    <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <Button
        variant="outline"
        onClick={onReconcile}
        disabled={isReconciling}
        aria-label="Reconciliar dados com banco"
        className="w-full border-primary/25 text-primary hover:bg-primary/5 sm:w-auto"
      >
        <RefreshCcw className={`mr-2 h-4 w-4 ${isReconciling ? 'animate-spin' : ''}`} />
        Reconciliar dados
      </Button>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
        {children}
      </div>
    </div>
  );
}
