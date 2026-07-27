import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { RecurringCharge } from '@/interface/recurring';
import { cn, currency, formatMonth } from '@/lib/utils';

/**
 * O degrau, dito por três canais ao mesmo tempo: seta, cor e texto.
 *
 * Aqui a cor não pode carregar o significado sozinha porque o sinal se inverte
 * em relação ao resto do app — na tela de Faturas, gastar menos é bom; numa
 * assinatura, cair de preço também é bom, mas a leitura importante é "mudou sem
 * eu ver", e uma queda de 20% merece a mesma atenção que uma alta.
 */
function PriceStep({ from, to, change }: { from: number; to: number; change: number }) {
  const up = change > 0;
  const Icon = change === 0 ? ArrowRightIcon : up ? ArrowUpRightIcon : ArrowDownRightIcon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        change === 0 ? 'text-muted-foreground' : up ? 'text-destructive' : 'text-positive',
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="tabular">
        {up ? '+' : ''}
        {change.toFixed(1)}%
      </span>
      <span className="tabular font-normal text-muted-foreground">
        {currency(from)} → {currency(to)}
      </span>
    </span>
  );
}

/**
 * A escada inteira de preços, do mais antigo ao mais novo.
 *
 * É o que o extrato do banco não tem: oito anos de série contínua mostram que o
 * Spotify passou por sete preços, incluindo uma promoção de R$ 9,90 que durou
 * dez meses e voltou. Um degrau isolado não conta essa história.
 */
function PriceLadder({ charge }: { charge: RecurringCharge }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {charge.plateaus.map((plateau, index) => {
        const last = index === charge.plateaus.length - 1;

        return (
          <li key={`${plateau.since}-${plateau.amount}`} className="flex items-center gap-1">
            <span
              className={cn(
                'rounded-md border px-2 py-1 text-xs',
                last ? 'border-border bg-accent/60 text-foreground' : 'border-transparent bg-muted/50 text-muted-foreground',
              )}
            >
              <span className="tabular font-medium">{currency(plateau.amount)}</span>
              <span className="ml-1.5 text-muted-foreground">
                {formatMonth(plateau.since)}
                {/* Quantas cobranças sustentaram o preço: um patamar de duas é
                    bem mais frágil que um de trinta, e a tela não deveria
                    apresentar os dois com a mesma confiança. */}
                <span className="ml-1 opacity-70">·{plateau.charges}x</span>
              </span>
            </span>
            {!last && <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground/60" />}
          </li>
        );
      })}
    </ol>
  );
}

export function RecurringList({ charges }: { charges: RecurringCharge[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Card className="divide-y divide-border overflow-hidden">
      {charges.map((charge) => {
        const open = expanded === charge.title;

        return (
          <div key={charge.title}>
            <button
              type="button"
              onClick={() => setExpanded(open ? null : charge.title)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 sm:gap-4 sm:px-5"
            >
              <ChevronRightIcon
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform',
                  open && 'rotate-90',
                )}
              />

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{charge.title}</span>
                  {!charge.active && (
                    <Badge variant="outline" className="shrink-0 text-muted-foreground">
                      encerrada
                    </Badge>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {charge.charges} cobranças · {charge.months} meses
                  {/* O mesmo estabelecimento sob vários gateways virou um grupo
                      só; sem dizer isso, o número de cobranças não bate com o
                      que a busca por aquele título devolve na tela de Compras. */}
                  {charge.titles.length > 1 && ` · ${charge.titles.length} grafias`}
                </span>
              </span>

              <span className="shrink-0 text-right">
                <span className="tabular block text-sm font-medium">
                  {currency(charge.current)}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  desde {formatMonth(charge.since)}
                </span>
              </span>

              <span className="hidden w-56 shrink-0 justify-end sm:flex">
                {charge.previous !== null && charge.change !== null ? (
                  <PriceStep from={charge.previous} to={charge.current} change={charge.change} />
                ) : (
                  <span className="text-xs text-muted-foreground">preço único</span>
                )}
              </span>
            </button>

            {open && (
              <div className="space-y-3 bg-muted/30 px-4 pt-1 pb-4 sm:px-5 sm:pl-12">
                {/* No celular o degrau não cabe na linha fechada; aqui ele cabe. */}
                {charge.previous !== null && charge.change !== null && (
                  <div className="sm:hidden">
                    <PriceStep from={charge.previous} to={charge.current} change={charge.change} />
                  </div>
                )}

                <PriceLadder charge={charge} />

                {charge.titles.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Agrupado de: <span className="text-foreground">{charge.titles.join(', ')}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
