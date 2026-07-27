import { TableSortLabel } from '@mui/material';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Column } from '../../../interface/tableColumn';

const PAGINATION_OPTIONS = [100, 500, 5000];

/** Aplica o formatador declarado na coluna ao valor bruto da linha. */
function renderCell<T>(column: Column<T>, value: unknown): ReactNode {
  if (column.format && typeof value === 'number') return column.format(value);
  if (column.formatDate && typeof value === 'string') return column.formatDate(value);
  if (column.formatMonth && typeof value === 'string') return column.formatMonth(value);
  // Categoria ausente no mês = 0% (a API só devolve as categorias com gasto).
  if (column.formatPercentage) return column.formatPercentage(typeof value === 'number' ? value : 0);
  return value == null ? '' : String(value);
}

/**
 * Tabela com cabeçalho fixo, ordenação por coluna e paginação. É genérica na
 * linha porque serve tanto às compras quanto às faturas, que têm formatos
 * diferentes.
 */
export default function StickyHeadTable<T extends object>({
  rows,
  columns,
}: {
  rows: T[];
  columns: Column<T>[];
}) {
  const [page, setPage] = useState(0);
  const [orderBy, setOrderBy] = useState<Extract<keyof T, string> | null>(null);
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [rowsPerPage, setRowsPerPage] = useState(PAGINATION_OPTIONS[0]);

  const handleChangeRowsPerPage = (event: ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(+event.target.value);
    setPage(0);
  };

  const handleSort = (property: Extract<keyof T, string>) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrderBy(property);
    setOrder(isAsc ? 'desc' : 'asc');
  };

  // Sem coluna escolhida, mantém a ordem em que a API devolveu (já ordenada por data).
  const sortedRows = orderBy === null ? rows : [...rows].sort(compareBy(orderBy, order));

  return (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      <TableContainer sx={{ maxHeight: 880 }}>
        <Table stickyHeader aria-label="sticky table">
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  align={column.align}
                  style={{ minWidth: column.minWidth }}
                >
                  <TableSortLabel
                    active={orderBy === column.id}
                    direction={orderBy === column.id ? order : 'asc'}
                    onClick={() => handleSort(column.id)}
                  >
                    {column.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedRows
              .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
              // O zebrado vem do tema, não de cores fixas: com fundo escuro, o
              // `#f2f2f2`/branco de antes deixava texto claro sobre claro.
              .map((row, index) => (
                <TableRow
                  hover
                  tabIndex={-1}
                  key={rowKey(row, index)}
                  sx={{ '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } }}
                >
                  {columns.map((column) => (
                    <TableCell key={column.id} align={column.align}>
                      {renderCell(column, row[column.id])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={PAGINATION_OPTIONS}
        component="div"
        count={rows.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={(_event, newPage) => setPage(newPage)}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Paper>
  );
}

/** Compras vêm com `_id` do Mongo; faturas não têm id próprio e caem no índice. */
function rowKey(row: object, index: number): string | number {
  const id = (row as Record<string, unknown>)._id;
  return typeof id === 'string' ? id : index;
}

function compareBy<T>(key: Extract<keyof T, string>, order: 'asc' | 'desc') {
  return (a: T, b: T): number => {
    const aValue = a[key];
    const bValue = b[key];

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return order === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }

    const aNumber = Number(aValue) || 0;
    const bNumber = Number(bValue) || 0;
    return order === 'asc' ? aNumber - bNumber : bNumber - aNumber;
  };
}
