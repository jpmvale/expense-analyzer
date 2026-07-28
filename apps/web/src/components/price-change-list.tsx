import { ArrowDownRightIcon, ArrowUpRightIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { PriceChange } from '@/lib/priceChanges';
import { cn, currency, formatMonth } from '@/lib/utils';

/**
 * Um reajuste que apareceu nos últimos ciclos.
 *
 * A cor segue o sinal do gasto — subiu é ruim, caiu é bom —, mas ela não carrega
 * o significado sozinha: a seta e o texto dizem a mesma coisa. A leitura que
 * importa aqui é "mudou sem eu ver", e uma queda de 20% merece a mesma atenção
 * que uma alta.
 */
function Row({ change }: { change: PriceChange }) {
  const up = change.yearly > 0;
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon;

  return (
    <li className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{change.label}</p>
        <p className="tabular mt-0.5 text-xs text-muted-foreground">
          {currency(change.previous)} → {currency(change.current)} · desde{' '}
          {formatMonth(change.since)}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <span
          className={cn(
            'tabular inline-flex items-center gap-1 text-sm font-medium',
            up ? 'text-destructive' : 'text-positive',
          )}
        >
          <Icon className="size-3.5" />
          {up ? '+' : ''}
          {change.change.toFixed(1)}%
        </span>
        {/*
         * O percentual sozinho não decide nada: +8,8% pode ser R$ 7 ou R$ 700 no
         * ano. É o valor anualizado que diz se vale a pena cancelar.
         */}
        <p className="tabular mt-0.5 text-xs text-muted-foreground">
          {up ? '+' : ''}
          {currency(change.yearly)}/ano
        </p>
      </div>
    </li>
  );
}

export function PriceChangeList({ changes }: { changes: PriceChange[] }) {
  if (changes.length === 0) return null;

  return (
    <ul className="space-y-3">
      {changes.map((change) => (
        <Row key={change.key} change={change} />
      ))}
      <li className="pt-1">
        <Link
          to="/recurring"
          className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          Ver a escada de preços de todas
        </Link>
      </li>
    </ul>
  );
}
