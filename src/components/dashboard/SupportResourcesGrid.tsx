import { Dispatch, SetStateAction } from 'react';
import { ConfirmActionButton } from '@/components/common/ConfirmActionButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tables } from '@/integrations/supabase/types';
import { Trash2 } from 'lucide-react';

type SupportFormsState = {
  documentoNome: string;
  documentoTipo: string;
  documentoUrl: string;
  bagagemItem: string;
  bagagemQuantidade: string;
  viajanteNome: string;
  viajanteEmail: string;
  viajanteTelefone: string;
  preparativoTitulo: string;
  preparativoDescricao: string;
};

type ModuleState<T extends keyof TablesMap> = {
  data: Tables<T>[];
  isCreating: boolean;
};

type TablesMap = {
  documentos: Tables<'documentos'>;
  bagagem: Tables<'bagagem'>;
  viajantes: Tables<'viajantes'>;
  preparativos: Tables<'preparativos'>;
};

type SupportResourcesGridProps = {
  canEditTrip: boolean;
  supportForms: SupportFormsState;
  setSupportForms: Dispatch<SetStateAction<SupportFormsState>>;
  documentsModule: ModuleState<'documentos'>;
  luggageModule: ModuleState<'bagagem'>;
  travelersModule: ModuleState<'viajantes'>;
  prepModule: ModuleState<'preparativos'>;
  openingDocumentPath: string | null;
  downloadingDocumentPath: string | null;
  createDocument: () => Promise<void>;
  removeDocument: (id: string) => Promise<void>;
  openSupportDocument: (path: string | null) => Promise<void>;
  downloadSupportDocument: (path: string | null, fileName?: string | null) => Promise<void>;
  createLuggageItem: () => Promise<void>;
  toggleLuggageChecked: (item: Tables<'bagagem'>) => Promise<void>;
  removeLuggageItem: (id: string) => Promise<void>;
  createTraveler: () => Promise<void>;
  removeTraveler: (id: string) => Promise<void>;
  createPrepItem: () => Promise<void>;
  togglePrepDone: (item: Tables<'preparativos'>) => Promise<void>;
  removePrepItem: (id: string) => Promise<void>;
};

export function SupportResourcesGrid({
  canEditTrip,
  supportForms,
  setSupportForms,
  documentsModule,
  luggageModule,
  travelersModule,
  prepModule,
  openingDocumentPath,
  downloadingDocumentPath,
  createDocument,
  removeDocument,
  openSupportDocument,
  downloadSupportDocument,
  createLuggageItem,
  toggleLuggageChecked,
  removeLuggageItem,
  createTraveler,
  removeTraveler,
  createPrepItem,
  togglePrepDone,
  removePrepItem,
}: SupportResourcesGridProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Documentos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Nome" value={supportForms.documentoNome} onChange={(e) => setSupportForms((s) => ({ ...s, documentoNome: e.target.value }))} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Tipo" value={supportForms.documentoTipo} onChange={(e) => setSupportForms((s) => ({ ...s, documentoTipo: e.target.value }))} />
            <Input placeholder="URL (opcional)" value={supportForms.documentoUrl} onChange={(e) => setSupportForms((s) => ({ ...s, documentoUrl: e.target.value }))} />
          </div>
          <Button onClick={() => void createDocument()} disabled={!canEditTrip || !supportForms.documentoNome.trim() || documentsModule.isCreating}>Adicionar documento</Button>
          <div className="space-y-2">
            {documentsModule.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum documento.</p>
            ) : documentsModule.data.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span>{doc.nome}</span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void openSupportDocument(doc.arquivo_url)}
                    disabled={openingDocumentPath === doc.arquivo_url}
                  >
                    {openingDocumentPath === doc.arquivo_url ? 'Abrindo...' : 'Abrir'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void downloadSupportDocument(doc.arquivo_url, doc.nome)}
                    disabled={downloadingDocumentPath === doc.arquivo_url}
                  >
                    {downloadingDocumentPath === doc.arquivo_url ? 'Baixando...' : 'Baixar'}
                  </Button>
                  <ConfirmActionButton
                    ariaLabel="Remover documento"
                    title="Remover documento"
                    description="O documento de apoio será removido da viagem."
                    confirmLabel="Remover"
                    onConfirm={() => removeDocument(doc.id)}
                    disabled={!canEditTrip}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmActionButton>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Bagagem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
            <Input placeholder="Item" value={supportForms.bagagemItem} onChange={(e) => setSupportForms((s) => ({ ...s, bagagemItem: e.target.value }))} />
            <Input type="number" min="1" placeholder="Qtd" value={supportForms.bagagemQuantidade} onChange={(e) => setSupportForms((s) => ({ ...s, bagagemQuantidade: e.target.value }))} />
          </div>
          <Button onClick={() => void createLuggageItem()} disabled={!canEditTrip || !supportForms.bagagemItem.trim() || luggageModule.isCreating}>Adicionar item</Button>
          <div className="space-y-2">
            {luggageModule.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item.</p>
            ) : luggageModule.data.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span>{item.item} · {item.quantidade}x</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => void toggleLuggageChecked(item)} disabled={!canEditTrip}>{item.conferido ? 'Desmarcar' : 'Conferir'}</Button>
                  <ConfirmActionButton
                    ariaLabel="Remover item de bagagem"
                    title="Remover item de bagagem"
                    description="Esse item será removido da checklist de bagagem."
                    confirmLabel="Remover"
                    onConfirm={() => removeLuggageItem(item.id)}
                    disabled={!canEditTrip}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmActionButton>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Viajantes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Nome" value={supportForms.viajanteNome} onChange={(e) => setSupportForms((s) => ({ ...s, viajanteNome: e.target.value }))} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Email" value={supportForms.viajanteEmail} onChange={(e) => setSupportForms((s) => ({ ...s, viajanteEmail: e.target.value }))} />
            <Input placeholder="Telefone" value={supportForms.viajanteTelefone} onChange={(e) => setSupportForms((s) => ({ ...s, viajanteTelefone: e.target.value }))} />
          </div>
          <Button onClick={() => void createTraveler()} disabled={!canEditTrip || !supportForms.viajanteNome.trim() || travelersModule.isCreating}>Adicionar viajante</Button>
          <div className="space-y-2">
            {travelersModule.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum viajante.</p>
            ) : travelersModule.data.map((traveler) => (
              <div key={traveler.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span>{traveler.nome}</span>
                <ConfirmActionButton
                  ariaLabel="Remover viajante"
                  title="Remover viajante"
                  description="Esse viajante será removido da lista da viagem."
                  confirmLabel="Remover"
                  onConfirm={() => removeTraveler(traveler.id)}
                  disabled={!canEditTrip}
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmActionButton>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Preparativos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Título" value={supportForms.preparativoTitulo} onChange={(e) => setSupportForms((s) => ({ ...s, preparativoTitulo: e.target.value }))} />
          <Textarea placeholder="Descrição (opcional)" value={supportForms.preparativoDescricao} onChange={(e) => setSupportForms((s) => ({ ...s, preparativoDescricao: e.target.value }))} />
          <Button onClick={() => void createPrepItem()} disabled={!canEditTrip || !supportForms.preparativoTitulo.trim() || prepModule.isCreating}>Adicionar preparativo</Button>
          <div className="space-y-2">
            {prepModule.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum preparativo.</p>
            ) : prepModule.data.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span className={item.concluido ? 'line-through text-muted-foreground' : ''}>{item.titulo}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => void togglePrepDone(item)} disabled={!canEditTrip}>{item.concluido ? 'Reabrir' : 'Concluir'}</Button>
                  <ConfirmActionButton
                    ariaLabel="Remover preparativo"
                    title="Remover preparativo"
                    description="Este preparativo será removido da checklist."
                    confirmLabel="Remover"
                    onConfirm={() => removePrepItem(item.id)}
                    disabled={!canEditTrip}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmActionButton>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
