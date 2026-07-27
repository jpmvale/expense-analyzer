import { AlertCircleIcon, CheckCircle2Icon, CoinsIcon, ReceiptTextIcon, TagsIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UncategorizedList, type ClassifyRequest } from '@/components/uncategorized-list';
import type { Category, UncategorizedTitle } from '@/interface/category';
import { capitalize, currency } from '@/lib/utils';
import { listCategories, listUncategorized, saveRule } from '../../api/client';

/**
 * Quantos grupos a lista mostra de saída.
 *
 * A lista vem ordenada por dinheiro parado, então os primeiros são onde o
 * esforço rende — na base de referência, 29% dos títulos concentram 80% do
 * valor. Despejar quatrocentas linhas de uma vez faria a tela parecer uma
 * pendência interminável em vez de uma pilha que diminui.
 */
const PAGE_SIZE = 40;

function Uncategorized() {
  const [groups, setGroups] = useState<UncategorizedTitle[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [pending, known] = await Promise.all([listUncategorized(), listCategories()]);
    setGroups(pending);
    setCategories(known);
  }, []);

  useEffect(() => {
    load()
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [load]);

  const classify = useCallback(
    async ({ kind, value, category }: ClassifyRequest) => {
      setError(null);
      try {
        const { classified } = await saveRule({ kind, value, category });
        await load();
        setDone(
          `${classified} ${classified === 1 ? 'compra foi' : 'compras foram'} para ${capitalize(category)}.`,
        );
      } catch (cause) {
        setDone(null);
        setError((cause as Error).message);
      }
    },
    [load],
  );

  const totals = useMemo(
    () => ({
      titles: groups.length,
      purchases: groups.reduce((acc, group) => acc + group.frequency, 0),
      amount: groups.reduce((acc, group) => acc + Math.abs(group.total), 0),
    }),
    [groups],
  );

  return (
    <>
      <PageHeader
        title="Sem categoria"
        description="O que o emissor mandou sem classificar, do que mais pesa para o que menos pesa. Classificar um estabelecimento vale para todas as compras dele — inclusive as das próximas faturas."
      />

      {error && (
        <Card className="mb-4 flex items-start gap-3 border-destructive/40 p-4 text-sm">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Não deu para classificar.</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </div>
        </Card>
      )}

      {done && !error && (
        <Card className="mb-4 flex items-start gap-3 border-primary/40 p-4 text-sm">
          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>{done}</p>
        </Card>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Dinheiro sem categoria"
          value={currency(totals.amount)}
          Icon={CoinsIcon}
          loading={loading}
        />
        <StatCard
          label="Estabelecimentos"
          value={totals.titles.toLocaleString('pt-BR')}
          hint="parcelas do mesmo lugar contam como um"
          Icon={TagsIcon}
          loading={loading}
        />
        <StatCard
          label="Compras"
          value={totals.purchases.toLocaleString('pt-BR')}
          Icon={ReceiptTextIcon}
          loading={loading}
        />
      </div>

      {loading ? (
        <Card className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </Card>
      ) : (
        <>
          <UncategorizedList
            groups={groups.slice(0, visible)}
            categories={categories}
            onClassify={classify}
          />

          {visible < groups.length && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => setVisible((n) => n + PAGE_SIZE)}>
                Mostrar mais {Math.min(PAGE_SIZE, groups.length - visible)} de{' '}
                {groups.length - visible}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default Uncategorized;
