import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import type Bill from '@/interface/bill';
import { categoriesByVolume } from '@/lib/billColumns';
import { capitalize, cn, currency, formatMonth } from '@/lib/utils';

/**
 * Intensidade do fundo da célula, proporcional ao peso da categoria no mês.
 *
 * É um mapa de calor de um tom só sobreposto à tabela: dá para varrer a coluna e
 * ver em que meses aquela categoria pesou, sem ler número por número. O teto
 * baixo é proposital — acima disso o texto começa a perder contraste.
 */
function tintFor(percentage: number): string | undefined {
  if (!percentage) return undefined;
  const intensity = Math.min(32, percentage * 0.65);
  return `color-mix(in oklab, var(--chart-1) ${intensity.toFixed(1)}%, transparent)`;
}

function Percentage({ value }: { value: number }) {
  if (!value) return <span className="text-muted-foreground/40">–</span>;
  return <span className="tabular">{value.toFixed(1)}%</span>;
}

export function BillsTable({ bills }: { bills: Bill[] }) {
  const categories = useMemo(() => categoriesByVolume(bills), [bills]);
  // Mais recente primeiro: é o mês que se quer olhar ao abrir a tela.
  const rows = useMemo(() => [...bills].reverse(), [bills]);

  return (
    <>
      {/* Mobile: um cartão por fatura, com as três categorias que mais pesaram. */}
      <div className="space-y-3 md:hidden">
        {rows.map((bill) => {
          const top = [...bill.categoriesResult].sort((a, b) => b.percentage - a.percentage);
          return (
            <Card key={bill.month} className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{formatMonth(bill.month)}</span>
                <span className="tabular text-base font-semibold">{currency(bill.total)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{bill.frequency} compras</span>
                <span className="tabular">
                  {bill.valuePaid ? `pago ${currency(bill.valuePaid)}` : 'sem pagamento'}
                </span>
              </div>
              {top.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {top.slice(0, 3).map((category) => (
                    <li key={category.categoryByMonth} className="flex items-center gap-2 text-xs">
                      <span className="w-24 shrink-0 truncate text-muted-foreground">
                        {capitalize(category.categoryByMonth)}
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-chart-1"
                          style={{ width: `${Math.min(100, category.percentage)}%` }}
                        />
                      </span>
                      <span className="tabular w-11 shrink-0 text-right text-muted-foreground">
                        {category.percentage.toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="hidden overflow-hidden md:block">
        <TableWrapper>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {/* A coluna do mês fica fixa: sem ela, rolar para a direita
                    perde a referência de qual fatura se está lendo. */}
                <TableHead className="sticky left-0 z-10 bg-card">Mês</TableHead>
                <TableHead className="text-right">Valor pago</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Compras</TableHead>
                {categories.map((category) => (
                  <TableHead key={category} className="text-right">
                    {capitalize(category)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((bill) => (
                <TableRow key={bill.month}>
                  <TableCell className="tabular sticky left-0 z-10 bg-card font-medium whitespace-nowrap">
                    {formatMonth(bill.month)}
                  </TableCell>
                  <TableCell className="tabular text-right whitespace-nowrap text-muted-foreground">
                    {bill.valuePaid ? currency(bill.valuePaid) : '–'}
                  </TableCell>
                  <TableCell className="tabular text-right font-medium whitespace-nowrap">
                    {currency(bill.total)}
                  </TableCell>
                  <TableCell className="tabular text-right text-muted-foreground">
                    {bill.frequency}
                  </TableCell>
                  {categories.map((category) => {
                    const percentage = typeof bill[category] === 'number' ? bill[category] : 0;
                    return (
                      <TableCell
                        key={category}
                        className={cn('text-right', !percentage && 'text-muted-foreground')}
                        style={{ backgroundColor: tintFor(percentage) }}
                      >
                        <Percentage value={percentage} />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrapper>
      </Card>
    </>
  );
}
