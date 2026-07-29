import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react';
import type { SortableField } from '@/api/client';
import { nextSort, PAGE_SIZES, type Sort } from '@/lib/purchaseSort';
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
import { CategoryPicker } from '@/components/category-picker';
import type { Category } from '@/interface/category';
import type Purchase from '@/interface/purchase';
import { capitalize, cn, currency, formatDate, formatMonth, isFutureDate } from '@/lib/utils';

type SortKey = SortableField;

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: 'title', label: 'Título' },
  { key: 'amount', label: 'Valor', className: 'text-right' },
  { key: 'category', label: 'Categoria' },
  { key: 'referenceMonth', label: 'Fatura' },
  { key: 'date', label: 'Data' },
];


/** Estorno é negativo e merece leitura própria — não é um gasto a menos escondido. */
function Amount({ value }: { value: number }) {
  return (
    <span className={cn('tabular font-medium', value < 0 && 'text-primary')}>
      {currency(value)}
    </span>
  );
}

/**
 * Marca a linha cuja data ainda não chegou — uma parcela já lançada numa
 * fatura futura.
 *
 * A ordenação por data, que é o padrão da tabela, põe essas linhas no topo:
 * são as datas mais recentes que existem, mesmo sem terem acontecido. O
 * registro é legítimo e a ordem continua correta — o que faltava era a linha
 * dizer isso sozinha, em vez de parecer "a compra mais nova" por engano.
 */
function FutureBadge() {
  return (
    <Badge
      variant="outline"
      className="ml-1.5 align-middle"
      title="Parcela já lançada numa fatura futura — a data ainda não chegou."
    >
      futura
    </Badge>
  );
}

interface ReclassifyProps {
  categories?: Category[];
  /** Ausente deixa a categoria como rótulo. É o que mantém a tabela reusável. */
  onReclassify?: (purchase: Purchase, category: string) => Promise<void>;
}

/**
 * A categoria da compra, clicável quando dá para reclassificar.
 *
 * A correção fica onde o erro é notado. Uma categoria errada aparece lendo a
 * tabela, e mandar o usuário até outra tela para consertá-la é o tipo de desvio
 * que faz ninguém consertar. A regra criada aqui é sempre de título exato: quem
 * clicou apontou uma compra, não descreveu um padrão.
 */
function CategoryCell({
  purchase,
  categories,
  onReclassify,
}: { purchase: Purchase } & ReclassifyProps) {
  const label = <Badge variant="outline">{capitalize(purchase.category)}</Badge>;
  if (!categories || !onReclassify) return label;

  return (
    <CategoryPicker
      categories={categories}
      value={purchase.category}
      align="start"
      onSelect={(category) => onReclassify(purchase, category)}
    >
      <button
        type="button"
        className="rounded-md transition-opacity hover:opacity-80"
        aria-label={`Mudar a categoria de ${purchase.title}`}
      >
        {label}
      </button>
    </CategoryPicker>
  );
}

export interface PurchasesTableProps extends ReclassifyProps {
  /** A página que o servidor devolveu. A tabela não reordena nem fatia. */
  purchases: Purchase[];
  loading?: boolean;
  sort: Sort;
  onSortChange: (sort: Sort) => void;
  /** Página atual, 1-based, como na URL e na API. */
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  /** Linhas que o filtro alcança — não as desta página. */
  total: number;
}

/**
 * A tabela de compras, controlada de fora.
 *
 * Ordenar e paginar são do servidor, e o componente ficou sem `useMemo` e sem
 * `slice` por isso. A alternativa — manter a ordenação aqui — ordenaria apenas
 * as linhas da página aberta e chamaria o resultado de "ordenado por valor",
 * que é falso e não dá nenhum sintoma: a tela parece funcionar.
 */
export function PurchasesTable({
  purchases,
  loading,
  categories,
  onReclassify,
  sort,
  onSortChange,
  page,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  total,
}: PurchasesTableProps) {
  const rows = purchases;
  const start = (page - 1) * pageSize;

  const toggleSort = (key: SortKey) => onSortChange(nextSort(sort, key));

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

  // `total`, e não o tamanho da página: uma página vazia com resultados atrás
  // dela é outra situação, e dizer "nenhuma compra encontrada" ali seria mentira.
  if (total === 0) {
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
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <CategoryCell
                  purchase={purchase}
                  categories={categories}
                  onReclassify={onReclassify}
                />
                <span>{formatDate(purchase.date)}</span>
                {isFutureDate(purchase.date) && <FutureBadge />}
              </div>
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

      {/*
       * O cabeçalho gruda no topo da própria tabela, não no topo da página — de
       * propósito. Uma tentativa anterior prendia `top` à altura da barra de
       * filtros, e isso é frágil: essa altura muda com o que está acima na
       * página (cartões, gráficos), e cada mudança ali quebraria o cabeçalho de
       * novo. Limitar a altura da tabela e rolar só o que está dentro dela
       * resolve sem depender de nada fora daqui — inclusive a paginação, que
       * fica fora do limite e nunca some rolando.
       */}
      <TableWrapper className="hidden max-h-[65vh] overflow-y-auto md:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent">
              {COLUMNS.map(({ key, label, className }) => {
                const active = sort.key === key;
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
                  <CategoryCell
                    purchase={purchase}
                    categories={categories}
                    onReclassify={onReclassify}
                  />
                </TableCell>
                <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                  {formatMonth(purchase.referenceMonth)}
                </TableCell>
                <TableCell className="tabular whitespace-nowrap text-muted-foreground">
                  {formatDate(purchase.date)}
                  {isFutureDate(purchase.date) && <FutureBadge />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableWrapper>

      <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="tabular text-xs text-muted-foreground">
          {start + 1}–{start + rows.length} de {total.toLocaleString('pt-BR')}
        </p>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(next) => onPageSizeChange(Number(next))}>
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
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Anterior
          </Button>
          <span className="tabular text-xs text-muted-foreground">
            {page}/{pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </Card>
  );
}
