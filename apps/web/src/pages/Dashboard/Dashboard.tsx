import { AlertCircleIcon, CalendarRangeIcon, CoinsIcon, ReceiptTextIcon, WalletIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CategoryBreakdown } from '@/components/category-breakdown';
import { MonthlySpendChart } from '@/components/charts/monthly-spend-chart';
import { ExpectationList } from '@/components/expectation-list';
import { PageHeader } from '@/components/layout/app-shell';
import { StatCard } from '@/components/stat-card';
import { TrendBadge } from '@/components/trend-badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PriceChangeList } from '@/components/price-change-list';
import { buildCategoryExpectations } from '@/lib/categoryExpectation';
import { buildPriceChanges, RECENT_CYCLES } from '@/lib/priceChanges';
import { currency, formatMonth } from '@/lib/utils';
import { listBills, listRecurring } from '../../api/client';
import type Bill from '../../interface/bill';
import type { RecurringCharge } from '../../interface/recurring';

/** Quantos meses a evolução mostra. O histórico inteiro vive em Compras. */
const WINDOW = 24;

const Dashboard = () => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [recurring, setRecurring] = useState<RecurringCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBills()
      .then(setBills)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  // As assinaturas vêm à parte, e a falha delas não derruba a tela: os números
  // de fatura são o assunto da Visão geral, e o aviso de reajuste é um extra que
  // ou aparece ou some sem fazer barulho.
  useEffect(() => {
    listRecurring()
      .then(setRecurring)
      .catch(() => setRecurring([]));
  }, []);

  const view = useMemo(() => {
    if (bills.length === 0) return null;

    // O cartão traz parcelas de meses que ainda não chegaram: as últimas faturas
    // da lista estão pela metade. Tomá-las como "última fatura" mostraria um mês
    // de R$ 510 com quatro lançamentos. Os agregados olham só o que já fechou; o
    // que está agendado aparece à parte, que é informação útil.
    //
    // O recorte é o fim do ciclo, não o mês da fatura: `month` nomeia o mês em
    // que ela vence, e o consumo vem do anterior. Comparar `month` com o mês
    // corrente descartava um ciclo inteiro já fechado — em 27/07/2026 a fatura de
    // agosto, com o ciclo encerrado no dia 26, caía em "faturas futuras" e a tela
    // analisava junho.
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    // Data local, e não UTC: "hoje" aqui é o dia de quem está olhando a tela.
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const closed = bills.filter((bill) => bill.cycleEnd < today);
    const upcoming = bills.filter((bill) => bill.cycleEnd >= today);

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
      // Comparar contra o histórico, e não só descrever: "restaurante R$ 359"
      // não diz se é muito. A régua é a própria categoria — cada uma tem uma
      // variação natural diferente.
      expectations: buildCategoryExpectations(closed),
      closed,
      points: closed.slice(-WINDOW).map((bill) => ({
        month: bill.month,
        total: bill.total,
        count: bill.frequency,
      })),
    };
  }, [bills]);

  const priceChanges = useMemo(
    () => (view ? buildPriceChanges(recurring, view.closed) : []),
    [recurring, view],
  );

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
          {view.upcomingCount === 1
            ? 'fatura que ainda não fechou.'
            : 'faturas que ainda não fecharam.'}{' '}
          Ficam de fora dos números acima.
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

        <div className="space-y-4">
          {/*
           * O cartão só existe quando houve reajuste. Um aviso que aparece todo
           * dia deixa de ser aviso, e a escada completa de cada assinatura já
           * mora em Assinaturas — aqui entra apenas o degrau que é notícia.
           */}
          {priceChanges.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Mudou de preço</CardTitle>
                <CardDescription>
                  {priceChanges.length === 1 ? 'Uma assinatura' : `${priceChanges.length} assinaturas`}{' '}
                  {priceChanges.length === 1 ? 'foi reajustada' : 'foram reajustadas'} nos últimos{' '}
                  {RECENT_CYCLES} ciclos
                </CardDescription>
              </CardHeader>
              <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                <PriceChangeList changes={priceChanges} />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Fora do normal</CardTitle>
            </CardHeader>
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              {loading || !view ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : (
                <ExpectationList
                  expectations={view.expectations}
                  month={formatMonth(view.latest.month)}
                />
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
      </div>
    </>
  );
};

export default Dashboard;
