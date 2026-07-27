import type ChartData from '../interface/chartData';
import type Purchase from '../interface/purchase';

/**
 * Chave `YYYY-MM` de uma data, lida em UTC.
 *
 * As compras chegam da API em UTC (`2025-03-01T00:00:00.000Z`). Lê-las com
 * `getMonth()` — horário local — joga toda compra do dia 1º para o mês anterior
 * em fusos negativos, e o gráfico ganha um mês fantasma no começo. Daí o getUTC*.
 */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Agrupa as compras por mês, preenchendo com zero os meses sem nenhuma compra
 * para o gráfico não colapsar os buracos do histórico.
 *
 * Espera `data` ordenada por data crescente, como a API devolve.
 */
export function groupByMonth(data: Purchase[]): ChartData[] {
  if (data.length === 0) return [];

  const groupedByMonth: Record<string, ChartData> = {};

  // O intervalo vai da primeira à última compra. Antes ia até *hoje*: filtrando
  // um período antigo, o gráfico ganhava uma cauda de barras vazias até o mês
  // corrente.
  const first = new Date(data[0].date);
  const last = new Date(data[data.length - 1].date);

  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  const end = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));

  while (cursor <= end) {
    const key = monthKey(cursor);
    groupedByMonth[key] = { value: key, data: [] };
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  for (const record of data) {
    groupedByMonth[monthKey(new Date(record.date))]?.data.push(record);
  }

  return Object.values(groupedByMonth);
}

export function groupByCategory(data: Purchase[]): ChartData[] {
  const groupedByCategory: Record<string, ChartData> = {};

  for (const record of data) {
    groupedByCategory[record.category] ??= { value: record.category, data: [] };
    groupedByCategory[record.category].data.push(record);
  }

  return Object.values(groupedByCategory);
}
