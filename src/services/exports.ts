import { TripSnapshot } from '@/services/tripSnapshot';

function normalizeFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportTripSnapshotJson(snapshot: TripSnapshot) {
  const fileName = `${normalizeFileName(snapshot.trip.nome || 'trip')}-snapshot.json`;
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' });
  triggerDownload(blob, fileName);
}

export function exportTripSnapshotPdf(snapshot: TripSnapshot) {
  const html = `
    <html>
      <head>
        <title>Resumo da viagem</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1f2937; }
          h1 { font-size: 22px; margin-bottom: 6px; }
          p { margin: 4px 0; }
          ul { margin: 12px 0 0 20px; }
          .muted { color: #6b7280; }
          .section { margin-top: 18px; }
        </style>
      </head>
      <body>
        <h1>${snapshot.trip.nome}</h1>
        <p class="muted">Exportado em ${new Date(snapshot.exportedAt).toLocaleString('pt-BR')}</p>
        <div class="section">
          <p><strong>Destino:</strong> ${snapshot.trip.destino ?? 'Não informado'}</p>
          <p><strong>Período:</strong> ${snapshot.trip.data_inicio ?? 'Sem início'} até ${snapshot.trip.data_fim ?? 'Sem fim'}</p>
        </div>
        <div class="section">
          <h2>Totais</h2>
          <ul>
            <li>Voos: ${snapshot.totals.voos}</li>
            <li>Hospedagens: ${snapshot.totals.hospedagens}</li>
            <li>Transportes: ${snapshot.totals.transportes}</li>
            <li>Despesas: ${snapshot.totals.despesas}</li>
            <li>Tarefas: ${snapshot.totals.tarefas}</li>
            <li>Restaurantes: ${snapshot.totals.restaurantes}</li>
          </ul>
        </div>
        <div class="section">
          <p class="muted">Use "Salvar como PDF" na janela de impressão para baixar o arquivo.</p>
        </div>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
  if (!printWindow) {
    throw new Error('Não foi possível abrir a janela de impressão. Verifique se pop-ups estão bloqueados.');
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
