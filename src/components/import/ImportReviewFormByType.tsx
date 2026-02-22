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
          <CardTitle className="text-base">Edição detalhada</CardTitle>
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
            <Input placeholder="Nome de exibição" value={reviewState.voo.nome_exibicao} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, nome_exibicao: e.target.value } }))} />
            <Input placeholder="Código da reserva (PNR)" value={reviewState.voo.codigo_reserva} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, codigo_reserva: e.target.value } }))} />
            <Input placeholder="Número do voo" value={reviewState.voo.numero} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, numero: e.target.value } }))} />
            <Input placeholder="Companhia" value={reviewState.voo.companhia} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, companhia: e.target.value } }))} />
            <Input placeholder="Origem" value={reviewState.voo.origem} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, origem: e.target.value } }))} />
            <Input placeholder="Destino" value={reviewState.voo.destino} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, destino: e.target.value } }))} />
            <Input type="date" value={reviewState.voo.data_inicio} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, data_inicio: e.target.value } }))} />
            <Input type="time" value={reviewState.voo.hora_inicio} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, hora_inicio: e.target.value } }))} />
            <Input type="date" value={reviewState.voo.data_fim} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, data_fim: e.target.value } }))} />
            <Input type="time" value={reviewState.voo.hora_fim} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, hora_fim: e.target.value } }))} />
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
            <Input placeholder="Passageiro" value={reviewState.voo.passageiro_hospede} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, passageiro_hospede: e.target.value } }))} />
            <Input placeholder="Método de pagamento" value={reviewState.voo.metodo_pagamento} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, metodo_pagamento: e.target.value } }))} />
            <Input placeholder="Pontos utilizados" value={reviewState.voo.pontos_utilizados} onChange={(e) => onChange((review) => ({ ...review, voo: { ...review.voo, pontos_utilizados: e.target.value } }))} />
          </div>
        )}

        {reviewState.type === 'hospedagem' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Nome de exibição" value={reviewState.hospedagem.nome_exibicao} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, nome_exibicao: e.target.value } }))} />
            <Input placeholder="Provedor (Airbnb, Booking...)" value={reviewState.hospedagem.provedor} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, provedor: e.target.value } }))} />
            <Input placeholder="Código da reserva" value={reviewState.hospedagem.codigo_reserva} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, codigo_reserva: e.target.value } }))} />
            <Input placeholder="Hóspede principal" value={reviewState.hospedagem.passageiro_hospede} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, passageiro_hospede: e.target.value } }))} />
            <Input placeholder="Nome da hospedagem" value={reviewState.hospedagem.nome} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, nome: e.target.value } }))} />
            <Input placeholder="Localização" value={reviewState.hospedagem.localizacao} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, localizacao: e.target.value } }))} />
            <Input type="date" value={reviewState.hospedagem.check_in} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, check_in: e.target.value } }))} />
            <Input type="date" value={reviewState.hospedagem.check_out} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, check_out: e.target.value } }))} />
            <Input type="time" value={reviewState.hospedagem.hora_inicio} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, hora_inicio: e.target.value } }))} />
            <Input type="time" value={reviewState.hospedagem.hora_fim} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, hora_fim: e.target.value } }))} />
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
            <Input placeholder="Método de pagamento" value={reviewState.hospedagem.metodo_pagamento} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, metodo_pagamento: e.target.value } }))} />
            <Input placeholder="Pontos utilizados" value={reviewState.hospedagem.pontos_utilizados} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, pontos_utilizados: e.target.value } }))} />
            <Input placeholder="Dica de viagem" value={reviewState.hospedagem.dica_viagem} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, dica_viagem: e.target.value } }))} />
            <Input placeholder="Como chegar" value={reviewState.hospedagem.como_chegar} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, como_chegar: e.target.value } }))} />
            <Input placeholder="Atrações próximas" value={reviewState.hospedagem.atracoes_proximas} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, atracoes_proximas: e.target.value } }))} />
            <Input placeholder="Restaurantes próximos" value={reviewState.hospedagem.restaurantes_proximos} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, restaurantes_proximos: e.target.value } }))} />
            <Input placeholder="Dica IA" value={reviewState.hospedagem.dica_ia} onChange={(e) => onChange((review) => ({ ...review, hospedagem: { ...review.hospedagem, dica_ia: e.target.value } }))} />
          </div>
        )}

        {reviewState.type === 'transporte' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Nome de exibição" value={reviewState.transporte.nome_exibicao} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, nome_exibicao: e.target.value } }))} />
            <Input placeholder="Provedor" value={reviewState.transporte.provedor} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, provedor: e.target.value } }))} />
            <Input placeholder="Código da reserva" value={reviewState.transporte.codigo_reserva} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, codigo_reserva: e.target.value } }))} />
            <Input placeholder="Passageiro" value={reviewState.transporte.passageiro_hospede} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, passageiro_hospede: e.target.value } }))} />
            <Input placeholder="Tipo de transporte" value={reviewState.transporte.tipo} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, tipo: e.target.value } }))} />
            <Input placeholder="Operadora" value={reviewState.transporte.operadora} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, operadora: e.target.value } }))} />
            <Input placeholder="Origem" value={reviewState.transporte.origem} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, origem: e.target.value } }))} />
            <Input placeholder="Destino" value={reviewState.transporte.destino} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, destino: e.target.value } }))} />
            <Input type="date" value={reviewState.transporte.data_inicio} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, data_inicio: e.target.value } }))} />
            <Input type="time" value={reviewState.transporte.hora_inicio} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, hora_inicio: e.target.value } }))} />
            <Input type="date" value={reviewState.transporte.data_fim} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, data_fim: e.target.value } }))} />
            <Input type="time" value={reviewState.transporte.hora_fim} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, hora_fim: e.target.value } }))} />
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
            <Input placeholder="Método de pagamento" value={reviewState.transporte.metodo_pagamento} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, metodo_pagamento: e.target.value } }))} />
            <Input placeholder="Pontos utilizados" value={reviewState.transporte.pontos_utilizados} onChange={(e) => onChange((review) => ({ ...review, transporte: { ...review.transporte, pontos_utilizados: e.target.value } }))} />
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
