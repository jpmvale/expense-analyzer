import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '@/components/charts/chart-tooltip';
import type ChartData from '@/interface/chartData';
import { compactCurrency, formatMonth } from '@/lib/utils';

/**
 * Gasto por mês. Uma série só, então um tom só e sem legenda — o título já diz
 * o que a barra é. A grade é recuada de propósito: o dado é a figura.
 */
export function MonthlySpendChart({ data, height = 300 }: { data: ChartData[]; height?: number }) {
  const points = useMemo(
    () =>
      data.map((group) => ({
        month: group.value,
        label: formatMonth(group.value),
        total: Number(group.data.reduce((acc, p) => acc + p.amount, 0).toFixed(2)),
        count: group.data.length,
      })),
    [data],
  );

  // Com muitos meses, rotular todos vira um borrão: mostra um a cada N.
  const tickInterval = Math.max(0, Math.ceil(points.length / 12) - 1);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          interval={tickInterval}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: 'var(--chart-grid)' }}
          minTickGap={8}
        />
        <YAxis
          width={64}
          tickFormatter={(value: number) => compactCurrency(value)}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={<ChartTooltip />}
          cursor={{ fill: 'var(--accent)' }}
          animationDuration={120}
        />
        {/* Topo arredondado em 4px, ancorado na linha de base. */}
        <Bar dataKey="total" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
