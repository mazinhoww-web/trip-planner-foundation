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
    <div className="mb-6 flex flex-wrap justify-end gap-2">
      <Button variant="outline" onClick={onReconcile} disabled={isReconciling} aria-label="Reconciliar dados com banco">
        <RefreshCcw className={`mr-2 h-4 w-4 ${isReconciling ? 'animate-spin' : ''}`} />
        Reconciliar dados
      </Button>
      {children}
    </div>
  );
}
