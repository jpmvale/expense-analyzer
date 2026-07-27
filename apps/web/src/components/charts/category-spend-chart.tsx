import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '@/components/charts/chart-tooltip';
import type ChartData from '@/interface/chartData';
import { capitalize, compactCurrency } from '@/lib/utils';

const ROW_HEIGHT = 26;

/**
 * Escala do eixo de valor: rótulos redondos sem desperdiçar largura.
 *
 * Deixado no automático, o Recharts arredonda os dois limites para o mesmo passo
 * "redondo" — um estorno de -R$ 641 contra um máximo de R$ 83 mil empurrava o
 * início do eixo para -R$ 20 mil e comia um quarto da largura. Passar o domínio
 * exato resolvia a largura mas produzia rótulos quebrados (R$ 14,4 mil).
 *
 * Aqui os dois são separados: os ticks nascem de um passo 1-2-5 a partir do zero,
 * e o domínio acompanha o dado com uma folga mínima no lado negativo.
 */
function buildScale(min: number, max: number): { domain: [number, number]; ticks: number[] } {
  const magnitude = 10 ** Math.floor(Math.log10(max || 1));
  const normalized = max / magnitude;
  const step = (normalized <= 2 ? 0.5 : normalized <= 5 ? 1 : 2) * magnitude;

  const ticks: number[] = [];
  for (let tick = 0; tick <= max; tick += step) ticks.push(tick);

  const lastTick = ticks[ticks.length - 1] ?? 0;
  return {
    // O negativo ganha 10% de folga só para a barra não encostar na borda.
    domain: [min < 0 ? min * 1.1 : 0, Math.max(max, lastTick)],
    ticks,
  };
}

/**
 * Gasto por categoria, em barras horizontais ordenadas — e não numa pizza.
 *
 * Pizza serve para parte-do-todo em relance, com até ~6 fatias; aqui são 15
 * categorias com nomes longos, onde as fatias pequenas viram lascas indistintas
 * e a cor precisaria carregar 15 identidades. Na barra horizontal o nome fica no
 * eixo, a comparação é por comprimento, e a cor não precisa significar nada —
 * por isso um tom só.
 */
export function CategorySpendChart({ data }: { data: ChartData[] }) {
  const points = useMemo(
    () =>
      data
        .map((group) => ({
          label: capitalize(group.value),
          total: Number(group.data.reduce((acc, p) => acc + p.amount, 0).toFixed(2)),
          count: group.data.length,
        }))
        .sort((a, b) => b.total - a.total),
    [data],
  );

  if (points.length === 0) return null;

  const totals = points.map((point) => point.total);
  const { domain, ticks } = buildScale(Math.min(0, ...totals), Math.max(...totals));

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, points.length * ROW_HEIGHT + 40)}>
      <BarChart
        data={points}
        layout="vertical"
        margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
        barCategoryGap={4}
      >
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          domain={domain}
          ticks={ticks}
          tickFormatter={(value: number) => compactCurrency(value)}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={104}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: 'var(--accent)' }}
          animationDuration={120}
        />
        <Bar dataKey="total" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
