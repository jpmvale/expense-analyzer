import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Variação percentual contra um período de referência.
 *
 * Gastar mais aparece em vermelho e gastar menos em verde, mas a cor nunca vem
 * sozinha: a seta e o texto dizem a mesma coisa. Abaixo de 0,5% a variação é
 * ruído — vira "estável", com seta horizontal.
 */
export function TrendBadge({
  current,
  previous,
  label,
}: {
  current: number;
  previous: number;
  label: string;
}) {
  if (!previous) return null;

  const delta = ((current - previous) / Math.abs(previous)) * 100;
  const stable = Math.abs(delta) < 0.5;
  const Icon = stable ? ArrowRightIcon : delta > 0 ? ArrowUpRightIcon : ArrowDownRightIcon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        stable ? 'text-muted-foreground' : delta > 0 ? 'text-destructive' : 'text-positive',
      )}
    >
      <Icon className="size-3.5" />
      <span className="tabular">
        {stable ? 'estável' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`}
      </span>
      <span className="font-normal text-muted-foreground">{label}</span>
    </span>
  );
}
