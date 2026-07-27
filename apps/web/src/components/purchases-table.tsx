import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrapper,
} from '@/components/ui/table';
import type Purchase from '@/interface/purchase';
import { capitalize, cn, currency, formatDate, formatMonth } from '@/lib/utils';

type SortKey = 'title' | 'amount' | 'category' | 'referenceMonth' | 'date';
type Direction = 'asc' | 'desc';

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'title', label: 'Título' },
  { key: 'amount', label: 'Valor', className: 'text-right' },
  { key: 'category', label: 'Categoria' },
  { key: 'referenceMonth', label: 'Fatura' },
  { key: 'date', label: 'Data' },
];

const PAGE_SIZES = [25, 50, 100, 250];

function compare(a: Purchase, b: Purchase, key: SortKey, direction: Direction): number {
  const left = a[key];
  const right = b[key];
  const result =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), 'pt-BR');
  return direction === 'asc' ? result : -result;
}

/** Estorno é negativo e merece leitura própria — não é um gasto a menos escondido. */
function Amount({ value }: { value: number }) {
  return (
    <span className={cn('tabular font-medium', value < 0 && 'text-primary')}>
      {currency(value)}
    </span>
  );
}

export function PurchasesTable({
  purchases,
  loading,
}: {
  purchases: Purchase[];
  loading?: boolean;
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction } | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);

  const sorted = useMemo(() => {
    if (!sort) return purchases;
    return [...purchases].sort((a, b) => compare(a, b, sort.key, sort.direction));
  }, [purchases, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const start = current * pageSize;
  const rows = sorted.slice(start, start + pageSize);

  const toggleSort = (key: SortKey) => {
    setPage(0);
    setSort((prev) =>
      prev?.key === key
        ? prev.direction === 'asc'
          ? { key, direction: 'desc' }
          : null
        : { key, direction: 'asc' },
    );
  };

  if (loading) {
    return (
      <Card className="p-4">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (purchases.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Nenhuma compra encontrada com os filtros atuais.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Mobile: cada compra vira uma linha de leitura, não uma tabela apertada. */}
      <ul className="divide-y divide-border md:hidden">
        {rows.map((purchase) => (
          <li key={purchase._id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{purchase.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {capitalize(purchase.category)} · {formatDate(purchase.date)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <Amount value={purchase.amount} />
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatMonth(purchase.referenceMonth)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <TableWrapper className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {COLUMNS.map(({ key, label, className }) => {
                const active = sort?.key === key;
                const SortIcon = !active
                  ? ArrowUpDownIcon
                  : sort.direction === 'asc'
                    ? ArrowUpIcon
                    : ArrowDownIcon;
                return (
                  <TableHead key={key} className={className}>
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-foreground',
                        active && 'text-foreground',
                        className === 'text-right' && 'flex-row-reverse',
                      )}
                    >
                      {label}
                      <SortIcon className={cn('size-3', !active && 'opacity-40')} />
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((purchase) => (
              <TableRow key={purchase._id}>
                <TableCell className="max-w-72 truncate font-medium">{purchase.title}</TableCell>
                <TableCell className="text-right">
                  <Amount value={purchase.amount} />
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{capitalize(purchase.category)}</Badge>
                </TableCell>
                <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                  {formatMonth(purchase.referenceMonth)}
                </TableCell>
                <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                  {formatDate(purchase.date)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrapper>

      <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="tabular text-xs text-muted-foreground">
          {start + 1}–{Math.min(start + pageSize, sorted.length)} de {sorted.length}
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(next) => {
              setPageSize(Number(next));
              setPage(0);
            }}
          >
            <SelectTrigger className="h-8 w-24" aria-label="Linhas por página">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} / pág
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Anterior
          </Button>
          <span className="tabular text-xs text-muted-foreground">
            {current + 1}/{pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </Card>
  );
}
