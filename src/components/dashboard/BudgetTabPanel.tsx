import { BudgetExportActions } from '@/components/dashboard/BudgetExportActions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { REFERENCE_RATES_TO_BRL, convertAmountByReference, convertTotalsRecordByReference } from '@/services/currencyConversion';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';

const CHART_COLORS = ['#0f766e', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#65a30d'];

export type BudgetByCurrency = Record<string, number>;
export type ExpenseCategoryDatum = {
  categoria: string;
  total: number;
};
export type ExpenseByDateDatum = {
  data: string;
  total: number;
};

type BudgetTabPanelProps = {
  canExportPdf: boolean;
  canExportJson: boolean;
  canExportIcs: boolean;
  isExportingData: boolean;
  planTier: string;
  onExportJson: () => Promise<void> | void;
  onExportPdf: () => Promise<void> | void;
  onExportIcs: () => Promise<void> | void;
  realByCurrency: BudgetByCurrency;
  estimadoByCurrency: BudgetByCurrency;
  flightByCurrency: BudgetByCurrency;
  stayByCurrency: BudgetByCurrency;
  transportByCurrency: BudgetByCurrency;
  variacaoTotal: number;
  expensesByCategory: ExpenseCategoryDatum[];
  expensesByDate: ExpenseByDateDatum[];
  formatByCurrency: (values: BudgetByCurrency) => string;
  formatCurrency: (value: number | null | undefined, currency: string) => string;
};

export function BudgetTabPanel({
  canExportPdf,
  canExportJson,
  canExportIcs,
  isExportingData,
  planTier,
  onExportJson,
  onExportPdf,
  onExportIcs,
  realByCurrency,
  estimadoByCurrency,
  flightByCurrency,
  stayByCurrency,
  transportByCurrency,
  variacaoTotal,
  expensesByCategory,
  expensesByDate,
  formatByCurrency,
  formatCurrency,
}: BudgetTabPanelProps) {
  const [converterAmountRaw, setConverterAmountRaw] = useState('1000');
  const [converterFrom, setConverterFrom] = useState('BRL');
  const [converterTo, setConverterTo] = useState('USD');

  const conversionSnapshot = useMemo(() => {
    const realBrl = convertTotalsRecordByReference(realByCurrency, 'BRL');
    const estimadoBrl = convertTotalsRecordByReference(estimadoByCurrency, 'BRL');
    const realUsd = convertTotalsRecordByReference(realByCurrency, 'USD');
    const estimadoUsd = convertTotalsRecordByReference(estimadoByCurrency, 'USD');
    return {
      realBrl,
      estimadoBrl,
      realUsd,
      estimadoUsd,
    };
  }, [estimadoByCurrency, realByCurrency]);

  const converterAmount = useMemo(() => {
    const normalized = converterAmountRaw.replace(',', '.').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }, [converterAmountRaw]);

  const converterResult = useMemo(() => {
    if (converterAmount == null) return null;
    return convertAmountByReference(converterAmount, converterFrom, converterTo);
  }, [converterAmount, converterFrom, converterTo]);

  const availableCurrencies = useMemo(() => Object.keys(REFERENCE_RATES_TO_BRL), []);

  return (
    <>
      <BudgetExportActions
        canExportPdf={canExportPdf}
        canExportJson={canExportJson}
        canExportIcs={canExportIcs}
        isExporting={isExportingData}
        planTier={planTier}
        onExportJson={onExportJson}
        onExportPdf={onExportPdf}
        onExportIcs={onExportIcs}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total real (despesas)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              <Wallet className="h-5 w-5 text-primary" />
              {formatByCurrency(realByCurrency)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Baseado em despesas efetivamente lançadas.</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total estimado (reservas)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatByCurrency(estimadoByCurrency)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Soma de voos, hospedagens e transportes não cancelados.
            </p>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p>✈ Voos: {formatByCurrency(flightByCurrency)}</p>
              <p>🏨 Hospedagens: {formatByCurrency(stayByCurrency)}</p>
              <p>🚌 Transportes: {formatByCurrency(transportByCurrency)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Variação (real - estimado)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-bold">
              {variacaoTotal > 0 ? <TrendingUp className="h-5 w-5 text-rose-600" /> : <TrendingDown className="h-5 w-5 text-emerald-600" />}
              {formatCurrency(variacaoTotal, 'BRL')}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {variacaoTotal > 0 ? 'Acima do estimado' : 'Dentro/abaixo do estimado'}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Conversão de referência</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">Totais normalizados por câmbio de referência:</p>
            <div className="rounded-lg border bg-muted/25 p-2">
              <p><strong>Real (BRL):</strong> {formatCurrency(conversionSnapshot.realBrl, 'BRL')}</p>
              <p><strong>Estimado (BRL):</strong> {formatCurrency(conversionSnapshot.estimadoBrl, 'BRL')}</p>
            </div>
            <div className="rounded-lg border bg-muted/25 p-2">
              <p><strong>Real (USD):</strong> {formatCurrency(conversionSnapshot.realUsd, 'USD')}</p>
              <p><strong>Estimado (USD):</strong> {formatCurrency(conversionSnapshot.estimadoUsd, 'USD')}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Taxas de referência para planejamento. Valores finais podem variar na liquidação real.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Conversor rápido de moedas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="budget-converter-amount">Valor</Label>
              <Input
                id="budget-converter-amount"
                inputMode="decimal"
                placeholder="Ex.: 1000"
                value={converterAmountRaw}
                onChange={(event) => setConverterAmountRaw(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget-converter-from">De</Label>
              <Select value={converterFrom} onValueChange={setConverterFrom}>
                <SelectTrigger id="budget-converter-from">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCurrencies.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget-converter-to">Para</Label>
              <Select value={converterTo} onValueChange={setConverterTo}>
                <SelectTrigger id="budget-converter-to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCurrencies.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            {converterResult == null ? (
              <p className="text-muted-foreground">Informe um valor válido para converter.</p>
            ) : (
              <p className="font-medium">
                {formatCurrency(converterAmount, converterFrom)} = {formatCurrency(converterResult, converterTo)}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Conversão baseada em taxa de referência (planejamento), sem cotação em tempo real.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Despesas por categoria</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {expensesByCategory.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Sem dados de categorias para exibir.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expensesByCategory}
                    dataKey="total"
                    nameKey="categoria"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={2}
                  >
                    {expensesByCategory.map((entry, index) => (
                      <Cell key={entry.categoria} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value, 'BRL')} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Evolução de despesas por data</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {expensesByDate.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Sem dados de despesas para exibir.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expensesByDate}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="data" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value, 'BRL')} />
                  <Bar dataKey="total" fill="#0f766e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
