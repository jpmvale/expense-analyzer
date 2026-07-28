import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { PriceLadderChart } from '@/components/charts/price-ladder-chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { RecurringCharge } from '@/interface/recurring';
import { cn, currency, formatMonth } from '@/lib/utils';
import { clearSubscriptionName, nameSubscription } from '../api/client';

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
 *
 * Fica ao lado do gráfico, e não no lugar dele: o gráfico dá a proporção do
 * degrau, e os chips dão o valor exato e quantas cobranças sustentaram cada
 * preço, que é o que diz se aquele patamar é firme ou frágil.
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

/**
 * O apelido da assinatura.
 *
 * `Mp *Melimais` é o que o emissor manda; `Meli+` é como a coisa se chama. O
 * nome se prende à chave do grupo, não ao título, porque o mesmo serviço troca de
 * gateway ao longo dos anos — um apelido preso a `Dm *Spotify` se perderia na
 * fatura em que a cobrança voltasse como `Ebn *Spotify`.
 *
 * Só rótulo: não mexe em categoria, total nem agrupamento.
 */
function SubscriptionName({
  charge,
  onSaved,
}: {
  charge: RecurringCharge;
  onSaved: () => Promise<void>;
}) {
  const [value, setValue] = useState(charge.name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = value.trim();
  const changed = trimmed !== (charge.name ?? '');

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed !== '') void run(() => nameSubscription(charge.key, trimmed));
        }}
      >
        <label className="text-xs text-muted-foreground" htmlFor={`nome-${charge.key}`}>
          Nome
        </label>
        <Input
          id={`nome-${charge.key}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          // O título do cartão como placeholder: é o que a lista mostra enquanto
          // não há apelido, então o campo vazio já diz o que vai aparecer.
          placeholder={charge.title}
          maxLength={40}
          disabled={busy}
          className="h-8 w-full max-w-56 text-sm"
        />
        <Button type="submit" size="sm" disabled={busy || trimmed === '' || !changed}>
          Salvar
        </Button>
        {charge.name !== null && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setValue('');
              void run(() => clearSubscriptionName(charge.key));
            }}
          >
            Remover
          </Button>
        )}
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Abaixo de dois patamares não há evolução para desenhar: é um preço só. */
const MIN_PLATEAUS_FOR_CHART = 2;

export function RecurringList({
  charges,
  onRenamed,
}: {
  charges: RecurringCharge[];
  onRenamed: () => Promise<void>;
}) {
  // A chave do grupo, e não o título: é estável entre recargas da lista, então o
  // painel aberto continua aberto depois de batizar a assinatura.
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Card className="divide-y divide-border overflow-hidden">
      {charges.map((charge) => {
        const open = expanded === charge.key;

        return (
          <div key={charge.key}>
            <button
              type="button"
              onClick={() => setExpanded(open ? null : charge.key)}
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
                  <span className="truncate text-sm font-medium">
                    {charge.name ?? charge.title}
                  </span>
                  {!charge.active && (
                    <Badge variant="outline" className="shrink-0 text-muted-foreground">
                      encerrada
                    </Badge>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {/* Com apelido, o título do cartão vem aqui: é por ele que se
                      procura a cobrança na fatura ou na tela de Compras. */}
                  {charge.name !== null && `${charge.title} · `}
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

                {charge.plateaus.length >= MIN_PLATEAUS_FOR_CHART ? (
                  <PriceLadderChart plateaus={charge.plateaus} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Um preço só desde {formatMonth(charge.since)} — não há evolução para desenhar.
                  </p>
                )}

                <PriceLadder charge={charge} />

                <SubscriptionName charge={charge} onSaved={onRenamed} />

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
