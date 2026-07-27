import { AlertCircleIcon, CalendarRangeIcon, CoinsIcon, WalletIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BillsTable } from '@/components/bills-table';
import { PageHeader } from '@/components/layout/app-shell';
import { StatCard } from '@/components/stat-card';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { currency, formatMonth } from '@/lib/utils';
import { listBills } from '../../api/client';
import type Bill from '../../interface/bill';

const Bills = () => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBills()
      .then(setBills)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const spent = bills.reduce((acc, bill) => acc + bill.total, 0);
    return {
      count: bills.length,
      spent,
      average: bills.length > 0 ? spent / bills.length : 0,
      range:
        bills.length > 0
          ? `${formatMonth(bills[0].month)} – ${formatMonth(bills[bills.length - 1].month)}`
          : undefined,
    };
  }, [bills]);

  return (
    <>
      <PageHeader
        title="Faturas"
        description="Uma linha por mês de referência, com o peso de cada categoria."
      />

      {error && (
        <Card className="mb-4 flex items-start gap-3 border-destructive/40 p-4 text-sm">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Não foi possível carregar as faturas.</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </div>
        </Card>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Faturas"
          value={String(summary.count)}
          hint={summary.range}
          Icon={CalendarRangeIcon}
          loading={loading}
        />
        <StatCard
          label="Total gasto"
          value={currency(summary.spent)}
          Icon={CoinsIcon}
          loading={loading}
        />
        <StatCard
          label="Média por fatura"
          value={currency(summary.average)}
          Icon={WalletIcon}
          loading={loading}
        />
      </div>

      {loading ? (
        <Card className="space-y-2 p-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </Card>
      ) : bills.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma fatura carregada ainda.</p>
        </Card>
      ) : (
        <BillsTable bills={bills} />
      )}
    </>
  );
};

export default Bills;
