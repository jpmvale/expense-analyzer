import type { CategoryBreakdown as Breakdown } from '@/interface/bill';
import { capitalize, currency } from '@/lib/utils';

/**
 * Composição de um mês, em barras proporcionais. Um tom só: o nome está ao lado
 * de cada barra, então a cor não precisa distinguir categoria de categoria.
 */
export function CategoryBreakdown({
  categories,
  limit = 6,
}: {
  categories: Breakdown[];
  limit?: number;
}) {
  const ordered = [...categories].sort((a, b) => b.totalCategory - a.totalCategory).slice(0, limit);

  if (ordered.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem gastos neste mês.</p>;
  }

  const max = Math.max(...ordered.map((category) => category.totalCategory));

  return (
    <ul className="space-y-2.5">
      {ordered.map((category) => (
        <li key={category.categoryByMonth} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 truncate text-muted-foreground">
            {capitalize(category.categoryByMonth)}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-chart-1"
              style={{ width: `${Math.max(2, (category.totalCategory / max) * 100)}%` }}
            />
          </span>
          <span className="tabular w-24 shrink-0 text-right">
            {currency(category.totalCategory)}
          </span>
          <span className="tabular hidden w-12 shrink-0 text-right text-muted-foreground sm:block">
            {category.percentage.toFixed(0)}%
          </span>
        </li>
      ))}
    </ul>
  );
}
