import { DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, WandSparkles } from 'lucide-react';

type Props = {
  isDragActive: boolean;
  fileInputId: string;
  maxFilesPerBatch: number;
  canProcess: boolean;
  isProcessingBatch: boolean;
  isReprocessing: boolean;
  onRunBatch: () => void;
  onSelectFiles: (files: FileList | null) => void;
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
};

export function ImportUploadSection({
  isDragActive,
  fileInputId,
  maxFilesPerBatch,
  canProcess,
  isProcessingBatch,
  isReprocessing,
  onRunBatch,
  onSelectFiles,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  return (
    <Card className="border-primary/15 bg-white/95 shadow-sm">
      <CardContent className="pt-4">
        <div
          className={`rounded-xl border border-dashed p-3 transition-colors sm:p-4 ${
            isDragActive ? 'border-primary bg-primary/5' : 'border-border/60 bg-background/40'
          }`}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Upload className="h-4 w-4" />
            Arraste e solte arquivos aqui ou selecione pelo campo abaixo.
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end">
            <div className="min-w-0 space-y-2">
              <Label htmlFor={fileInputId}>Arquivos da viagem</Label>
              <Input
                id={fileInputId}
                type="file"
                multiple
                accept=".txt,.html,.eml,.pdf,.png,.jpg,.jpeg,.webp"
                onChange={(event) => onSelectFiles(event.target.files)}
                className="h-11 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {`Você pode subir até ${maxFilesPerBatch} arquivo(s) por lote. Formatos: txt, html, eml, pdf, png, jpg e webp.`}
              </p>
            </div>
            <div className="w-full space-y-2 lg:self-end">
              <Button
                onClick={onRunBatch}
                disabled={!canProcess}
                aria-label="Analisar arquivos selecionados"
                className="h-11 w-full bg-primary text-sm font-semibold hover:bg-primary/90"
              >
                {isProcessingBatch || isReprocessing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <WandSparkles className="mr-2 h-4 w-4" />
                )}
                Analisar arquivos
              </Button>
              <p className="text-[11px] text-muted-foreground lg:text-center">
                OCR + IA classifica cada arquivo e prepara confirmação final.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
