import { AlertCircleIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BillsList } from '@/components/bills-list';
import { CompositionChart } from '@/components/charts/composition-chart';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { buildComposition } from '@/lib/billComposition';
import { cn, formatMonth } from '@/lib/utils';
import { listBills } from '../../api/client';
import type Bill from '../../interface/bill';

/** Recortes de tempo do gráfico. `null` é o histórico inteiro. */
const WINDOWS: Array<{ label: string; months: number | null }> = [
  { label: '12 meses', months: 12 },
  { label: '24 meses', months: 24 },
  { label: 'Tudo', months: null },
];

const Bills = () => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState<number | null>(24);

  useEffect(() => {
    listBills()
      .then(setBills)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(
    () => (window === null ? bills : bills.slice(-window)),
    [bills, window],
  );

  // O topo de categorias é calculado sobre o recorte visível, não sobre tudo:
  // olhando os últimos 12 meses, quem manda são as categorias desses 12 meses.
  const composition = useMemo(() => buildComposition(visible), [visible]);

  const range =
    visible.length > 0
      ? `${formatMonth(visible[0].month)} – ${formatMonth(visible[visible.length - 1].month)}`
      : undefined;

  if (error) {
    return (
      <>
        <PageHeader title="Faturas" />
        <Card className="flex items-start gap-3 border-destructive/40 p-4 text-sm">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Não foi possível carregar as faturas.</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Faturas"
        description="Como o gasto e a mistura de categorias mudaram, mês a mês."
      />

      <Card className="mb-4">
        {/* No celular título e controles empilham: lado a lado, o título fica
            espremido numa coluna de duas palavras. */}
        <CardHeader className="gap-3 pb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <CardTitle>Composição mensal</CardTitle>
            <CardDescription>
              {loading ? 'Carregando…' : `${visible.length} faturas · ${range}`}
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-1">
            {WINDOWS.map(({ label, months }) => (
              <Button
                key={label}
                size="sm"
                variant="ghost"
                onClick={() => setWindow(months)}
                className={cn(
                  'h-7 px-2.5 text-xs',
                  window === months && 'bg-accent text-foreground',
                )}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <div className="pr-4 pb-4 pl-1">
          {loading ? (
            <Skeleton className="mx-3 h-[320px]" />
          ) : (
            <CompositionChart composition={composition} height={320} />
          )}
        </div>
      </Card>

      {loading ? (
        <Card className="space-y-2 p-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </Card>
      ) : visible.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma fatura carregada ainda.</p>
        </Card>
      ) : (
        <BillsList bills={visible} composition={composition} />
      )}
    </>
  );
};

export default Bills;
