import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Composition } from '@/lib/billComposition';
import { REST_KEY } from '@/lib/billComposition';
import { capitalize, compactCurrency, currency, formatMonth } from '@/lib/utils';

/**
 * A ordem dos slots é o mecanismo de segurança para daltonismo, não decoração:
 * foi escolhida para maximizar a distância entre vizinhos. Trocar a ordem degrada
 * isso silenciosamente.
 */
const SLOTS = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)'];

function colorFor(index: number): string {
  return SLOTS[index] ?? 'var(--cat-rest)';
}

function labelFor(key: string): string {
  return key === REST_KEY ? 'Demais' : capitalize(key);
}

interface TooltipPayload {
  dataKey?: string | number;
  value?: number;
  color?: string;
}

function CompositionTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;

  const visible = payload.filter((item) => (item.value ?? 0) !== 0).reverse();
  const total = payload.reduce((acc, item) => acc + (item.value ?? 0), 0);

  return (
    <div className="min-w-48 rounded-md border border-border bg-popover p-3 text-xs shadow-lg">
      <p className="font-medium text-popover-foreground">{label ? formatMonth(label) : ''}</p>
      <p className="tabular mt-0.5 mb-2 font-medium text-popover-foreground">{currency(total)}</p>
      <ul className="space-y-1">
        {visible.map((item) => (
          <li key={String(item.dataKey)} className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: item.color }}
            />
            <span className="flex-1 text-muted-foreground">{labelFor(String(item.dataKey))}</span>
            <span className="tabular text-popover-foreground">{currency(item.value ?? 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Gasto mensal empilhado por categoria.
 *
 * Responde de uma vez às duas perguntas que a tabela de percentuais só respondia
 * com rolagem horizontal: quanto se gastou em cada mês, e como a mistura mudou.
 *
 * A legenda é obrigatória aqui, não opcional: são sete séries, e duas mitigações
 * da paleta dependem dela — no tema claro dois matizes ficam abaixo de 3:1 de
 * contraste, e no escuro o par mais próximo fica na faixa mínima de separação sob
 * daltonismo. Legenda, folga entre os segmentos e a lista numérica logo abaixo são
 * o que torna a paleta legítima.
 */
export function CompositionChart({
  composition,
  height = 320,
}: {
  composition: Composition;
  height?: number;
}) {
  const { categories, points, hasRest } = composition;

  const data = useMemo(
    () => points.map((point) => ({ month: point.month, ...point.values })),
    [points],
  );

  const keys = useMemo(
    () => (hasRest ? [...categories, REST_KEY] : categories),
    [categories, hasRest],
  );

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            // Quantos rótulos cabem depende da largura, não do número de meses:
            // um intervalo calculado no código acerta no desktop e embola no
            // celular. `minTickGap` deixa o próprio gráfico descartar os que
            // ficariam colados.
            interval="preserveStartEnd"
            minTickGap={28}
            tickFormatter={formatMonth}
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
            content={<CompositionTooltip />}
            cursor={{ fill: 'var(--accent)' }}
            animationDuration={120}
          />
          {keys.map((key, index) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="gasto"
              fill={key === REST_KEY ? 'var(--cat-rest)' : colorFor(index)}
              maxBarSize={32}
              // Filete da cor da superfície entre as faixas: sem ele, duas
              // categorias vizinhas de tom parecido viram um bloco só.
              stroke="var(--card)"
              strokeWidth={1}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-2 text-xs">
        {keys.map((key, index) => (
          <li key={key} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-[3px]"
              style={{ backgroundColor: key === REST_KEY ? 'var(--cat-rest)' : colorFor(index) }}
            />
            <span className="text-muted-foreground">{labelFor(key)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
