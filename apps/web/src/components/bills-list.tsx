import { ChevronRightIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { TrendBadge } from '@/components/trend-badge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type Bill from '@/interface/bill';
import { REST_KEY, type Composition } from '@/lib/billComposition';
import { capitalize, cn, currency, formatMonth } from '@/lib/utils';

const SLOTS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)'];

function colorFor(category: string, categories: string[]): string {
  const index = categories.indexOf(category);
  return index >= 0 && index < SLOTS.length ? SLOTS[index] : 'var(--cat-rest)';
}

/**
 * Composição do mês numa barra só, com as mesmas cores do gráfico acima — é o que
 * permite ler a linha e o gráfico como a mesma informação em duas escalas.
 *
 * Valores negativos, que só aparecem em estorno, não viram faixa: largura
 * negativa não existe, e o abatimento já está no total da linha.
 */
function CompositionBar({
  values,
  categories,
}: {
  values: Record<string, number>;
  categories: string[];
}) {
  const segments = useMemo(() => {
    const positives = Object.entries(values).filter(([, value]) => value > 0);
    const total = positives.reduce((acc, [, value]) => acc + value, 0);
    if (total === 0) return [];

    const order = [...categories, REST_KEY];
    return positives
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([category, value]) => ({
        category,
        width: (value / total) * 100,
        color: category === REST_KEY ? 'var(--cat-rest)' : colorFor(category, categories),
      }));
  }, [values, categories]);

  if (segments.length === 0) return null;

  return (
    <span className="flex h-2 w-full gap-px overflow-hidden rounded-full">
      {segments.map(({ category, width, color }) => (
        <span
          key={category}
          title={category === REST_KEY ? 'Demais' : capitalize(category)}
          style={{ width: `${width}%`, backgroundColor: color }}
        />
      ))}
    </span>
  );
}

export function BillsList({ bills, composition }: { bills: Bill[]; composition: Composition }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const byMonth = new Map(composition.points.map((point) => [point.month, point.values]));

    return bills
      .map((bill, index) => ({
        bill,
        previous: index > 0 ? bills[index - 1] : undefined,
        upcoming: bill.month > currentMonth,
        values: byMonth.get(bill.month) ?? {},
      }))
      .reverse();
  }, [bills, composition]);

  return (
    <Card className="divide-y divide-border overflow-hidden">
      {rows.map(({ bill, previous, upcoming, values }) => {
        const open = expanded === bill.month;
        const breakdown = [...bill.categoriesResult].sort(
          (a, b) => b.totalCategory - a.totalCategory,
        );

        return (
          <div key={bill.month}>
            <button
              type="button"
              onClick={() => setExpanded(open ? null : bill.month)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 sm:gap-4 sm:px-5"
            >
              <ChevronRightIcon
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform',
                  open && 'rotate-90',
                )}
              />

              <span className="w-24 shrink-0">
                <span className="tabular block text-sm font-medium">
                  {formatMonth(bill.month)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {bill.frequency} compras
                  {/* Marca o mês que teve juros sem precisar abrir 95 linhas
                      para descobrir quais foram os três. */}
                  {bill.charges !== 0 && <span className="text-destructive"> · encargos</span>}
                </span>
              </span>

              {upcoming ? (
                <span className="flex-1">
                  <Badge variant="outline" className="font-normal">
                    em aberto
                  </Badge>
                </span>
              ) : (
                <span className="hidden flex-1 sm:block">
                  <CompositionBar values={values} categories={composition.categories} />
                </span>
              )}

              <span className="ml-auto shrink-0 text-right sm:ml-0">
                <span className="tabular block text-sm font-medium">{currency(bill.total)}</span>
                {previous && !upcoming ? (
                  <TrendBadge current={bill.total} previous={previous.total} />
                ) : (
                  <span className="block text-xs text-muted-foreground">
                    {bill.valuePaid ? `pago ${currency(bill.valuePaid)}` : 'sem pagamento'}
                  </span>
                )}
              </span>
            </button>

            {open && (
              <div className="bg-muted/30 px-4 pt-1 pb-4 sm:px-5">
                <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 pl-7 text-xs text-muted-foreground">
                  <span>
                    Valor pago:{' '}
                    <span className="tabular text-foreground">
                      {bill.valuePaid ? currency(bill.valuePaid) : '—'}
                    </span>
                  </span>
                  <span>
                    Categorias: <span className="tabular text-foreground">{breakdown.length}</span>
                  </span>
                  {/*
                   * Encargos só aparecem quando existem, e aparecem aqui e não
                   * ao lado do total porque não são gasto: são juros, multa e
                   * saldo rolado, que a fatura cobra e o consumo não explica.
                   * Somá-los ao total responderia "quanto você gastou" com
                   * dinheiro que ninguém gastou; escondê-los faria a fatura não
                   * fechar com o extrato do banco.
                   */}
                  {bill.charges !== 0 && (
                    <span>
                      Encargos:{' '}
                      <span className="tabular text-destructive">{currency(bill.charges)}</span>
                    </span>
                  )}
                </div>

                <ul className="space-y-1.5 pl-7">
                  {breakdown.map((category) => (
                    <li
                      key={category.categoryByMonth}
                      className="flex items-center gap-3 text-xs sm:gap-4"
                    >
                      <span className="flex w-32 shrink-0 items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-[3px]"
                          style={{
                            backgroundColor: colorFor(
                              category.categoryByMonth,
                              composition.categories,
                            ),
                          }}
                        />
                        <span className="truncate">{capitalize(category.categoryByMonth)}</span>
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.max(0, Math.min(100, category.percentage))}%`,
                            backgroundColor: colorFor(
                              category.categoryByMonth,
                              composition.categories,
                            ),
                          }}
                        />
                      </span>
                      <span className="tabular w-24 shrink-0 text-right">
                        {currency(category.totalCategory)}
                      </span>
                      <span className="tabular w-12 shrink-0 text-right text-muted-foreground">
                        {category.percentage.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
