import { currency } from '@/lib/utils';

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ value?: number; payload?: { label?: string; count?: number } }>;
  /** Como escrever o rótulo do eixo no cabeçalho do tooltip. */
  formatLabel?: (label: string) => string;
  /**
   * O substantivo de `count`. O padrão serve para gasto — onde a barra soma
   * lançamentos de um mês —, mas numa assinatura a barra é um preço, e o que se
   * conta são as cobranças que o sustentaram.
   */
  countLabel?: (count: number) => string;
}

/**
 * Tooltip dos gráficos. O texto usa tokens de tinta, nunca a cor da série — a
 * identidade fica na marca colorida ao lado, não na letra.
 */
export function ChartTooltip({
  active,
  label,
  payload,
  formatLabel,
  countLabel,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const point = payload[0];
  const count = point.payload?.count;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-popover-foreground">
        {point.payload?.label ?? (formatLabel && label ? formatLabel(label) : label)}
      </p>
      <p className="tabular mt-1 flex items-center gap-1.5 text-muted-foreground">
        <span className="size-2 rounded-[2px] bg-chart-1" />
        {currency(point.value ?? 0)}
      </p>
      {count !== undefined && (
        <p className="tabular mt-0.5 text-muted-foreground">
          {countLabel ? countLabel(count) : `${count} ${count === 1 ? 'lançamento' : 'lançamentos'}`}
        </p>
      )}
    </div>
  );
}
