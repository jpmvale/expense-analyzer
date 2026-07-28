import type { MonthlyPoint } from '@/components/charts/monthly-spend-chart';

/**
 * Preenche com zero os meses sem nenhuma compra.
 *
 * A API devolve só os meses em que houve gasto, e é o certo — ela agrega, não
 * desenha. Mas um gráfico que pula de janeiro para abril desenha três barras
 * lado a lado como se fossem meses consecutivos, e some com a informação de que
 * houve um intervalo sem nada.
 *
 * O intervalo vai da primeira à última compra do recorte, e não até hoje: um
 * filtro por um período antigo ganhava uma cauda de barras vazias até o mês
 * corrente.
 */
export function fillMonthGaps(points: MonthlyPoint[]): MonthlyPoint[] {
  if (points.length === 0) return [];

  const byMonth = new Map(points.map((point) => [point.month, point]));
  const months = [...byMonth.keys()].sort();

  const [firstYear, firstMonth] = months[0].split('-').map(Number);
  const last = months[months.length - 1];

  const filled: MonthlyPoint[] = [];
  // Cursor em UTC: somar mês em horário local atravessaria o horário de verão e
  // produziria uma chave repetida ou pulada uma vez por ano.
  const cursor = new Date(Date.UTC(firstYear, firstMonth - 1, 1));

  for (let guard = 0; guard < 1200; guard++) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
    filled.push(byMonth.get(key) ?? { month: key, total: 0, count: 0 });
    if (key === last) break;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return filled;
}
