import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '@/components/charts/chart-tooltip';
import { compactCurrency, formatMonth } from '@/lib/utils';

/** Um mês do gráfico. Serve tanto para compras agrupadas quanto para faturas. */
export interface MonthlyPoint {
  month: string;
  total: number;
  count: number;
}

/**
 * Gasto por mês. Uma série só, então um tom só e sem legenda — o título da seção
 * já diz o que a barra é. A grade é recuada de propósito: o dado é a figura.
 */
export function MonthlySpendChart({
  points,
  height = 300,
}: {
  points: MonthlyPoint[];
  height?: number;
}) {
  const data = points.map((point) => ({ ...point, label: formatMonth(point.month) }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          // Quantos rótulos cabem depende da largura, não do número de meses.
          interval="preserveStartEnd"
          minTickGap={28}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: 'var(--chart-grid)' }}
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
