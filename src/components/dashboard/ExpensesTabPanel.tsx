import { ConfirmActionButton } from '@/components/common/ConfirmActionButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tables } from '@/integrations/supabase/types';
import { DollarSign, Plus, Trash2 } from 'lucide-react';
import { Dispatch, SetStateAction } from 'react';

type ExpenseFormState = {
  titulo: string;
  valor: string;
  moeda: string;
  categoria: string;
  data: string;
};

type Props = {
  canEditTrip: boolean;
  expenseDialogOpen: boolean;
  setExpenseDialogOpen: (open: boolean) => void;
  expenseForm: ExpenseFormState;
  setExpenseForm: Dispatch<SetStateAction<ExpenseFormState>>;
  onCreateExpense: () => Promise<void> | void;
  isCreatingExpense: boolean;
  expensesLoading: boolean;
  expenses: Tables<'despesas'>[];
  onRemoveExpense: (id: string) => Promise<void> | void;
  isRemovingExpense: boolean;
  formatDate: (value?: string | null) => string;
  formatCurrency: (value?: number | null, currency?: string) => string;
};

export function ExpensesTabPanel({
  canEditTrip,
  expenseDialogOpen,
  setExpenseDialogOpen,
  expenseForm,
  setExpenseForm,
  onCreateExpense,
  isCreatingExpense,
  expensesLoading,
  expenses,
  onRemoveExpense,
  isRemovingExpense,
  formatDate,
  formatCurrency,
}: Props) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="font-display text-xl">Despesas reais</CardTitle>
          <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={!canEditTrip}>
                <Plus className="mr-2 h-4 w-4" />
                Nova despesa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] overflow-y-auto sm:w-full sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Nova despesa</DialogTitle>
                <DialogDescription>
                  Essa despesa impacta imediatamente o orçamento real da viagem.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Título</Label>
                  <Input value={expenseForm.titulo} onChange={(e) => setExpenseForm((s) => ({ ...s, titulo: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input type="number" step="0.01" value={expenseForm.valor} onChange={(e) => setExpenseForm((s) => ({ ...s, valor: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Moeda</Label>
                  <Input value={expenseForm.moeda} onChange={(e) => setExpenseForm((s) => ({ ...s, moeda: e.target.value.toUpperCase() }))} />
                </div>
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Input value={expenseForm.categoria} onChange={(e) => setExpenseForm((s) => ({ ...s, categoria: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" value={expenseForm.data} onChange={(e) => setExpenseForm((s) => ({ ...s, data: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>Cancelar</Button>
                <Button
                  onClick={() => void onCreateExpense()}
                  disabled={!canEditTrip || !expenseForm.titulo.trim() || !expenseForm.valor || isCreatingExpense}
                >
                  Salvar despesa
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {expensesLoading ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Carregando despesas...
          </div>
        ) : expenses.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <DollarSign className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma despesa registrada ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {expenses.map((expense) => (
              <Card key={expense.id} className="border-border/50">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{expense.titulo}</p>
                    <p className="text-sm text-muted-foreground">
                      {(expense.categoria?.trim() || 'Sem categoria')} · {formatDate(expense.data)}
                    </p>
                    <p className="text-sm font-semibold">{formatCurrency(expense.valor, expense.moeda ?? 'BRL')}</p>
                  </div>
                  <ConfirmActionButton
                    ariaLabel="Remover despesa"
                    title="Remover despesa"
                    description="Essa despesa será removida e os totais serão recalculados."
                    confirmLabel="Remover"
                    disabled={!canEditTrip || isRemovingExpense}
                    onConfirm={() => void onRemoveExpense(expense.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmActionButton>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
