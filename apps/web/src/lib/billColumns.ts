import type Bill from '../interface/bill';
import type { Column } from '../interface/tableColumn';

const currency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const percentage = (value: number) => (value ? `${value.toFixed(2)}%` : '-');

const FIXED_COLUMNS: Column<Bill>[] = [
  { id: 'month', label: 'Mês', minWidth: 50 },
  { id: 'valuePaid', label: 'Valor pago', minWidth: 70, format: currency },
  { id: 'total', label: 'Total', minWidth: 70, format: currency },
  { id: 'frequency', label: 'Compras', minWidth: 50 },
];

function capitalize(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * As colunas de categoria saem dos próprios dados.
 *
 * Antes eram uma lista fixa de 12 categorias escrita à mão, com acento e tudo:
 * qualquer categoria vinda de uma fatura real fora dessa lista existia na API e
 * simplesmente não aparecia na tela, sem aviso nenhum.
 */
export function buildBillColumns(bills: Bill[]): Column<Bill>[] {
  const categories = new Set<string>();
  for (const bill of bills) {
    for (const { categoryByMonth } of bill.categoriesResult) {
      categories.add(categoryByMonth);
    }
  }

  const categoryColumns: Column<Bill>[] = [...categories]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((category) => ({
      id: category,
      label: capitalize(category),
      minWidth: 20,
      formatPercentage: percentage,
    }));

  return [...FIXED_COLUMNS, ...categoryColumns];
}
