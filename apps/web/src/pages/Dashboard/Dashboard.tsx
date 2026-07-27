import { AlertCircleIcon, CalendarRangeIcon, CoinsIcon, ReceiptTextIcon, WalletIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CategoryBreakdown } from '@/components/category-breakdown';
import { MonthlySpendChart } from '@/components/charts/monthly-spend-chart';
import { PageHeader } from '@/components/layout/app-shell';
import { StatCard } from '@/components/stat-card';
import { TrendBadge } from '@/components/trend-badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { currency, formatMonth } from '@/lib/utils';
import { listBills } from '../../api/client';
import type Bill from '../../interface/bill';

/** Quantos meses a evolução mostra. O histórico inteiro vive em Compras. */
const WINDOW = 24;

const Dashboard = () => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBills()
      .then(setBills)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  const view = useMemo(() => {
    if (bills.length === 0) return null;

    // O cartão traz parcelas de meses que ainda não chegaram: as últimas faturas
    // da lista são futuras e estão pela metade. Tomá-las como "última fatura"
    // mostraria um mês de R$ 510 com quatro lançamentos. Os agregados olham só o
    // que já fechou; o que está agendado aparece à parte, que é informação útil.
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const closed = bills.filter((bill) => bill.month <= currentMonth);
    const upcoming = bills.filter((bill) => bill.month > currentMonth);

    if (closed.length === 0) return null;

    const latest = closed[closed.length - 1];
    const previous = closed[closed.length - 2];

    // Média dos 12 meses anteriores ao último — o último fica de fora para poder
    // ser comparado contra ela sem se incluir no próprio referencial.
    const lastTwelve = closed.slice(-13, -1);
    const average =
      lastTwelve.length > 0
        ? lastTwelve.reduce((acc, bill) => acc + bill.total, 0) / lastTwelve.length
        : 0;

    const year = latest.month.slice(0, 4);
    const yearTotal = closed
      .filter((bill) => bill.month.startsWith(year))
      .reduce((acc, bill) => acc + bill.total, 0);

    return {
      latest,
      previous,
      average,
      year,
      yearTotal,
      closedCount: closed.length,
      first: closed[0],
      upcomingTotal: upcoming.reduce((acc, bill) => acc + bill.total, 0),
      upcomingCount: upcoming.length,
      points: closed.slice(-WINDOW).map((bill) => ({
        month: bill.month,
        total: bill.total,
        count: bill.frequency,
      })),
    };
  }, [bills]);

  if (error) {
    return (
      <>
        <PageHeader title="Visão geral" />
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
        title="Visão geral"
        description={
          view ? `Fatura mais recente: ${formatMonth(view.latest.month)}.` : 'Carregando…'
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">Última fatura</span>
            <ReceiptTextIcon className="size-4 text-muted-foreground" />
          </div>
          {loading || !view ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : (
            <>
              <p className="tabular mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">
                {currency(view.latest.total)}
              </p>
              <div className="mt-1">
                {view.previous ? (
                  <TrendBadge
                    current={view.latest.total}
                    previous={view.previous.total}
                    label={`vs ${formatMonth(view.previous.month)}`}
                  />
                ) : null}
              </div>
            </>
          )}
        </Card>

        <StatCard
          label="Média dos 12 meses"
          value={view ? currency(view.average) : '–'}
          hint="anteriores à última fatura"
          Icon={WalletIcon}
          loading={loading}
        />
        <StatCard
          label={`Total em ${view?.year ?? ''}`}
          value={view ? currency(view.yearTotal) : '–'}
          Icon={CoinsIcon}
          loading={loading}
        />
        <StatCard
          label="Faturas fechadas"
          value={view ? String(view.closedCount) : '–'}
          hint={view ? `${formatMonth(view.first.month)} – ${formatMonth(view.latest.month)}` : undefined}
          Icon={CalendarRangeIcon}
          loading={loading}
        />
      </div>

      {view && view.upcomingCount > 0 && (
        <p className="mb-4 text-xs text-muted-foreground">
          Além dessas, <span className="tabular text-foreground">{currency(view.upcomingTotal)}</span>{' '}
          já estão lançados em {view.upcomingCount}{' '}
          {view.upcomingCount === 1 ? 'fatura futura' : 'faturas futuras'} — parcelas de compras já
          feitas. Ficam de fora dos números acima.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Evolução dos últimos {WINDOW} meses</CardTitle>
          </CardHeader>
          <div className="pr-4 pb-3 pl-1">
            {loading || !view ? (
              <Skeleton className="mx-3 h-[300px]" />
            ) : (
              <MonthlySpendChart points={view.points} height={300} />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>
              Composição de {view ? formatMonth(view.latest.month) : '…'}
            </CardTitle>
          </CardHeader>
          <div className="px-4 pb-4 sm:px-5 sm:pb-5">
            {loading || !view ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : (
              <>
                <CategoryBreakdown categories={view.latest.categoriesResult} />
                <Link
                  to="/bills"
                  className="mt-4 inline-block text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  Ver todas as faturas
                </Link>
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  );
};

export default Dashboard;
