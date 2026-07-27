import {
  AlertCircleIcon,
  CalculatorIcon,
  CoinsIcon,
  ReceiptTextIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CategoryFilter } from '@/components/filters/category-filter';
import { MonthFilter } from '@/components/filters/month-filter';
import { PageHeader } from '@/components/layout/app-shell';
import { PurchasesTable } from '@/components/purchases-table';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { currency } from '@/lib/utils';
import { CategoryBreakdown } from '@/components/category-breakdown';
import { MonthlySpendChart } from '@/components/charts/monthly-spend-chart';
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { listBills, listCategories, listPurchases, saveRule } from '../../api/client';
import { groupByCategory, groupByMonth } from '../../lib/groupPurchases';
import type { Category } from '../../interface/category';
import type Purchase from '../../interface/purchase';

/** Quantas categorias o painel lista. Acima disso a cauda não informa nada. */
const TOP_CATEGORIES = 7;

/** Espera o usuário parar de digitar antes de consultar a API. */
function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function Home() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [summary, setSummary] = useState({ total: 0, sum: 0, average: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // As opções de filtro vêm das faturas, não do resultado filtrado: antes a lista
  // de categorias encolhia conforme se filtrava, e não dava para voltar atrás.
  const [months, setMonths] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [month, setMonth] = useState<string | null>(null);
  const debouncedTitle = useDebounced(title);

  // As categorias em que dá para reclassificar. Vêm da API, e não das faturas,
  // porque a lista inclui as que o usuário criou e ainda não usou em nada.
  const [known, setKnown] = useState<Category[]>([]);
  const [reload, setReload] = useState(0);

  const hasFilters = selectedCategories.length > 0 || title !== '' || month !== null;

  const clearFilters = useCallback(() => {
    setSelectedCategories([]);
    setTitle('');
    setMonth(null);
  }, []);

  useEffect(() => {
    listBills()
      .then((bills) => {
        setMonths(bills.map((bill) => bill.month));
        const found = new Set<string>();
        for (const bill of bills) {
          for (const { categoryByMonth } of bill.categoriesResult) found.add(categoryByMonth);
        }
        setCategories([...found].sort((a, b) => a.localeCompare(b, 'pt-BR')));
      })
      .catch(() => {
        // As opções de filtro são um extra: falhar aqui não impede ver as compras.
      });
  }, [reload]);

  useEffect(() => {
    listCategories()
      .then(setKnown)
      .catch(() => {
        // Sem a lista, a categoria volta a ser só um rótulo — a tabela continua
        // legível, apenas sem o atalho de reclassificar.
      });
  }, [reload]);

  /**
   * Reclassificar daqui cria uma regra de título exato: quem clicou apontou uma
   * compra, não descreveu um padrão. Para pegar as variações do mesmo lugar de
   * uma vez, a tela de "Sem categoria" oferece a regra por trecho.
   */
  const reclassify = useCallback(async (purchase: Purchase, category: string) => {
    await saveRule({ kind: 'exact', value: purchase.title, category });
    setReload((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listPurchases({ categories: selectedCategories, title: debouncedTitle, month })
      .then((data) => {
        if (cancelled) return;
        setPurchases(data.purchases ?? []);
        setSummary({ total: data.total, sum: data.sum, average: data.average });
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCategories, debouncedTitle, month, reload]);

  const pointsByMonth = useMemo(
    () =>
      groupByMonth(purchases).map((group) => ({
        month: group.value,
        total: Number(group.data.reduce((acc, p) => acc + p.amount, 0).toFixed(2)),
        count: group.data.length,
      })),
    [purchases],
  );

  const categoryBreakdown = useMemo(() => {
    const total = purchases.reduce((acc, purchase) => acc + purchase.amount, 0);
    return groupByCategory(purchases).map((group) => {
      const totalCategory = group.data.reduce((acc, purchase) => acc + purchase.amount, 0);
      return {
        categoryByMonth: group.value,
        totalCategory,
        frequency: group.data.length,
        percentage: total > 0 ? (totalCategory * 100) / total : 0,
      };
    });
  }, [purchases]);

  // Cada painel some quando vira trivial: filtrando uma fatura só, o gráfico por
  // mês teria uma barra; filtrando uma categoria só, a composição teria 100% dela.
  const showMonthly = !month;
  const showCategories = selectedCategories.length !== 1;
  const hasPanels = showMonthly || showCategories;

  return (
    <>
      <PageHeader
        title="Compras"
        description="Todos os lançamentos, filtráveis por categoria, título e fatura."
      />

      {error && (
        <Card className="mb-4 flex items-start gap-3 border-destructive/40 p-4 text-sm">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Não foi possível carregar as compras.</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </div>
        </Card>
      )}

      {/*
       * A barra acompanha a rolagem a partir de `lg`, onde os filtros cabem numa
       * linha só. O ciclo desta tela é buscar, ler a tabela e refinar a busca —
       * com a barra parada no topo, refinar exigia subir e descer a página.
       *
       * Abaixo de `lg` ela fica parada: os filtros quebram em duas ou três linhas
       * e comeriam metade da tela do celular. O cabeçalho do app tem 3.5rem, daí
       * o `top-14`.
       */}
      <Card className="mb-4 p-3 sm:p-4 lg:sticky lg:top-14 lg:z-30 lg:shadow-lg">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <CategoryFilter
            options={categories}
            value={selectedCategories}
            onChange={setSelectedCategories}
          />
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Buscar por título…"
              className="pl-9"
              aria-label="Buscar por título"
            />
          </div>
          <MonthFilter months={months} value={month} onChange={setMonth} />
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters} className="justify-start sm:justify-center">
              <XIcon />
              Limpar
            </Button>
          )}
        </div>
      </Card>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total gasto"
          value={currency(summary.sum)}
          Icon={CoinsIcon}
          loading={loading}
        />
        <StatCard
          label="Lançamentos"
          value={summary.total.toLocaleString('pt-BR')}
          Icon={ReceiptTextIcon}
          loading={loading}
        />
        <StatCard
          label="Ticket médio"
          value={currency(summary.average)}
          Icon={CalculatorIcon}
          loading={loading}
        />
      </div>

      {/*
       * Os painéis ficam acima da tabela e ocupam a linha inteira, em vez de
       * disputar a largura com ela. A tabela é o assunto desta tela — os painéis
       * dão a forma do conjunto filtrado, e a tabela mostra o detalhe.
       */}
      {!loading && purchases.length > 0 && hasPanels && (
        <div
          className={cn(
            'mb-4 grid gap-4',
            showMonthly && showCategories && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
          )}
        >
          {showMonthly && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Gasto por mês</CardTitle>
                <CardDescription>
                  {pointsByMonth.length} {pointsByMonth.length === 1 ? 'mês' : 'meses'} no recorte
                  atual
                </CardDescription>
              </CardHeader>
              <div className="pr-4 pb-3 pl-1">
                <MonthlySpendChart points={pointsByMonth} height={240} />
              </div>
            </Card>
          )}

          {showCategories && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Onde o dinheiro foi</CardTitle>
                <CardDescription>
                  {categoryBreakdown.length > TOP_CATEGORIES
                    ? `As ${TOP_CATEGORIES} maiores de ${categoryBreakdown.length} categorias`
                    : 'Por categoria, da maior para a menor'}
                </CardDescription>
              </CardHeader>
              <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                <CategoryBreakdown categories={categoryBreakdown} limit={TOP_CATEGORIES} />
              </div>
            </Card>
          )}
        </div>
      )}

      <PurchasesTable
        purchases={purchases}
        loading={loading}
        categories={known}
        onReclassify={reclassify}
      />
    </>
  );
}

export default Home;
