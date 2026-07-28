import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from '@/components/charts/chart-tooltip';
import type { PricePlateau } from '@/interface/recurring';
import { currency, formatMonth } from '@/lib/utils';

/**
 * A escada de preços de uma assinatura, em barras.
 *
 * Uma barra por patamar, e não por mês. Por mês seria o eixo do tempo literal —
 * oito anos de Spotify dariam 96 barras —, mas o que se quer ver é o degrau, e o
 * patamar é a unidade em que o degrau existe. O preço disso é que a largura da
 * barra não diz quanto tempo o preço durou: um patamar de duas cobranças fica do
 * mesmo tamanho de um de dezessete. A duração vai no tooltip, em número, e a
 * escada em chips ao lado repete os valores exatos.
 *
 * O eixo Y começa em zero de propósito. Cortar a base exageraria o degrau — um
 * reajuste de R$ 21,90 para R$ 23,90 pareceria o dobro do preço, e a leitura
 * honesta é que ele é pequeno.
 */
export function PriceLadderChart({
  plateaus,
  height = 150,
}: {
  plateaus: PricePlateau[];
  height?: number;
}) {
  const data = plateaus.map((plateau) => ({
    label: formatMonth(plateau.since),
    amount: plateau.amount,
    count: plateau.charges,
  }));

  const last = data.length - 1;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          // Todos os rótulos, sempre: são poucos patamares (sete no pior caso da
          // base de referência) e cada um é a data em que aquele preço passou a
          // valer — esconder um deixaria uma barra sem explicação.
          interval={0}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: 'var(--chart-grid)' }}
        />
        <YAxis
          width={56}
          tickFormatter={(value: number) => currency(value)}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          content={
            <ChartTooltip
              countLabel={(count) => `${count} ${count === 1 ? 'cobrança' : 'cobranças'}`}
            />
          }
          cursor={{ fill: 'var(--accent)' }}
          animationDuration={120}
        />
        <Bar dataKey="amount" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {/* O preço de hoje em tinta cheia; os que já passaram, apagados. É a
              mesma hierarquia que os chips da escada usam. */}
          {data.map((point, index) => (
            <Cell key={`${point.label}-${index}`} fillOpacity={index === last ? 1 : 0.45} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
