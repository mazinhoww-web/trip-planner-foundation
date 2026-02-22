import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImportType } from '@/services/importPipeline';
import { ReviewState } from '@/components/import/import-types';

type Props = {
  reviewState: ReviewState;
  missingFieldsCount: number;
  onChange: (updater: (review: ReviewState) => ReviewState) => void;
};

export function ImportReviewFormByType({ reviewState, missingFieldsCount, onChange }: Props) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Revisão manual assistida</CardTitle>
          <Badge variant={missingFieldsCount > 0 ? 'destructive' : 'secondary'}>
            Campos para confirmar: {missingFieldsCount}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Tipo detectado</Label>
          <Select
            value={reviewState.type}
            onValueChange={(value: ImportType) => onChange((review) => ({ ...review, type: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="voo">Voo</SelectItem>
              <SelectItem value="hospedagem">Hospedagem</SelectItem>
              <SelectItem value="transporte">Transporte</SelectItem>
              <SelectItem value="restaurante">Restaurante</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {reviewState.type === 'voo' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Número do voo" value={reviewState.voo.numero} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, numero: e.target.value } }))} />
            <Input placeholder="Companhia" value={reviewState.voo.companhia} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, companhia: e.target.value } }))} />
            <Input placeholder="Origem" value={reviewState.voo.origem} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, origem: e.target.value } }))} />
            <Input placeholder="Destino" value={reviewState.voo.destino} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, destino: e.target.value } }))} />
            <Input type="datetime-local" value={reviewState.voo.data} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, data: e.target.value } }))} />
            <Select value={reviewState.voo.status} onValueChange={(value: 'confirmado' | 'pendente' | 'cancelado') => onChange((review) => ({ ...review, voo: { ...review.voo, status: value } }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Valor" type="number" step="0.01" value={reviewState.voo.valor} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, valor: e.target.value } }))} />
            <Input placeholder="Moeda" value={reviewState.voo.moeda} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, moeda: e.target.value.toUpperCase() } }))} />
          </div>
        )}

        {reviewState.type === 'hospedagem' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Nome da hospedagem" value={reviewState.hospedagem.nome} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, nome: e.target.value } }))} />
            <Input placeholder="Localização" value={reviewState.hospedagem.localizacao} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, localizacao: e.target.value } }))} />
            <Input type="date" value={reviewState.hospedagem.check_in} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, check_in: e.target.value } }))} />
            <Input type="date" value={reviewState.hospedagem.check_out} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, check_out: e.target.value } }))} />
            <Select value={reviewState.hospedagem.status} onValueChange={(value: 'confirmado' | 'pendente' | 'cancelado') => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, status: value } }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Valor" type="number" step="0.01" value={reviewState.hospedagem.valor} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, valor: e.target.value } }))} />
            <Input placeholder="Moeda" value={reviewState.hospedagem.moeda} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, moeda: e.target.value.toUpperCase() } }))} />
          </div>
        )}

        {reviewState.type === 'transporte' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Tipo de transporte" value={reviewState.transporte.tipo} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, tipo: e.target.value } }))} />
            <Input placeholder="Operadora" value={reviewState.transporte.operadora} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, operadora: e.target.value } }))} />
            <Input placeholder="Origem" value={reviewState.transporte.origem} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, origem: e.target.value } }))} />
            <Input placeholder="Destino" value={reviewState.transporte.destino} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, destino: e.target.value } }))} />
            <Input type="datetime-local" value={reviewState.transporte.data} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, data: e.target.value } }))} />
            <Select value={reviewState.transporte.status} onValueChange={(value: 'confirmado' | 'pendente' | 'cancelado') => onChange((review) => ({ ...review, transporte: { ...review.transporte, status: value } }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Valor" type="number" step="0.01" value={reviewState.transporte.valor} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, valor: e.target.value } }))} />
            <Input placeholder="Moeda" value={reviewState.transporte.moeda} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, moeda: e.target.value.toUpperCase() } }))} />
          </div>
        )}

        {reviewState.type === 'restaurante' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Nome do restaurante" value={reviewState.restaurante.nome} onChange={(e) => onChange((review) => ({ ...review, restaurante: { ...review.restaurante, nome: e.target.value } }))} />
            <Input placeholder="Cidade" value={reviewState.restaurante.cidade} onChange={(e) => onChange((review) => ({ ...review, restaurante: { ...review.restaurante, cidade: e.target.value } }))} />
            <Input placeholder="Tipo (ex.: italiano, japonês)" value={reviewState.restaurante.tipo} onChange={(e) => onChange((review) => ({ ...review, restaurante: { ...review.restaurante, tipo: e.target.value } }))} />
            <Input placeholder="Rating (0-5)" type="number" step="0.1" min="0" max="5" value={reviewState.restaurante.rating} onChange={(e) => onChange((review) => ({ ...review, restaurante: { ...review.restaurante, rating: e.target.value } }))} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
