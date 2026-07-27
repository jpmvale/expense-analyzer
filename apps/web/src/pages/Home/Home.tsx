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
import { listBills, listPurchases } from '../../api/client';
import { BarChart } from '../../components/shared/BarChart';
import { PieChart } from '../../components/shared/PieChart';
import { groupByCategory, groupByMonth } from '../../lib/groupPurchases';
import type Purchase from '../../interface/purchase';

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
  }, [selectedCategories, debouncedTitle, month]);

  const dataByMonth = useMemo(() => groupByMonth(purchases), [purchases]);
  const dataByCategory = useMemo(() => groupByCategory(purchases), [purchases]);

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

      <Card className="mb-4 p-3 sm:p-4">
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <PurchasesTable purchases={purchases} loading={loading} />

        {/* Gráficos ainda em MUI — migram para Recharts na próxima etapa. */}
        {!loading && purchases.length > 0 && (
          <div className="space-y-4">
            {!month && (
              <Card className="p-3">
                <BarChart chartData={dataByMonth} height={320} />
              </Card>
            )}
            <Card className="p-3">
              <PieChart chartData={dataByCategory} height={380} />
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

export default Home;
