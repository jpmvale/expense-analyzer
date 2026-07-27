import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from 'lucide-react';
import { cn, currency } from '@/lib/utils';

/** Abaixo disso a variação é ruído, não tendência. */
const STABLE_THRESHOLD = 0.5;

/**
 * Variação percentual contra um período de referência.
 *
 * Gastar mais aparece em vermelho e gastar menos em verde, mas a cor nunca vem
 * sozinha: a seta e o texto dizem a mesma coisa. O `title` traz a diferença em
 * reais, que o percentual sozinho esconde — 30% de um mês magro é pouco dinheiro.
 */
export function TrendBadge({
  current,
  previous,
  label,
  className,
}: {
  current: number;
  previous: number;
  /** Contra o quê. Some quando o contexto já diz — numa coluna de tabela, por exemplo. */
  label?: string;
  className?: string;
}) {
  if (!previous) return null;

  const delta = ((current - previous) / Math.abs(previous)) * 100;
  const difference = current - previous;
  const stable = Math.abs(delta) < STABLE_THRESHOLD;
  const Icon = stable ? ArrowRightIcon : delta > 0 ? ArrowUpRightIcon : ArrowDownRightIcon;

  return (
    <span
      title={`${difference > 0 ? '+' : '−'}${currency(Math.abs(difference))} em relação ao período anterior`}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        stable ? 'text-muted-foreground' : delta > 0 ? 'text-destructive' : 'text-positive',
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="tabular">
        {stable ? 'estável' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
      </span>
      {label ? <span className="font-normal text-muted-foreground">{label}</span> : null}
    </span>
  );
}
