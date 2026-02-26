import { useState } from 'react';
import { toast } from 'sonner';
import { requestTripExport } from '@/services/tripExport';
import { exportTripSnapshotJson, openPrintHtml } from '@/services/exports';
import { trackProductEvent } from '@/services/productAnalytics';

export function useTripExportActions(currentTripId: string | null) {
  const [isExportingData, setIsExportingData] = useState(false);

  const exportJson = async () => {
    if (!currentTripId) return;

    setIsExportingData(true);
    try {
      const result = await requestTripExport({
        viagemId: currentTripId,
        format: 'json',
      });
      if (result.error || !result.data?.snapshot) {
        throw new Error(result.error ?? 'Não foi possível exportar o JSON completo.');
      }
      exportTripSnapshotJson(result.data.snapshot, result.data.fileName);
      await trackProductEvent({
        eventName: 'export_triggered',
        featureKey: 'ff_export_json_full',
        viagemId: currentTripId,
        metadata: { format: 'json' },
      });
      toast.success('Snapshot JSON exportado com sucesso.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível exportar o JSON da viagem.';
      toast.error(message);
    } finally {
      setIsExportingData(false);
    }
  };

  const exportPdf = async () => {
    if (!currentTripId) return;

    setIsExportingData(true);
    try {
      const result = await requestTripExport({
        viagemId: currentTripId,
        format: 'pdf',
      });
      if (result.error || !result.data?.html) {
        throw new Error(result.error ?? 'Não foi possível iniciar a exportação em PDF.');
      }
      openPrintHtml(result.data.html);
      await trackProductEvent({
        eventName: 'export_triggered',
        featureKey: 'ff_export_pdf',
        viagemId: currentTripId,
        metadata: { format: 'pdf' },
      });
      toast.success('Resumo preparado para exportação em PDF.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível iniciar a exportação em PDF.';
      toast.error(message);
    } finally {
      setIsExportingData(false);
    }
  };

  return {
    isExportingData,
    exportJson,
    exportPdf,
  };
}
