import {
  AlertTriangleIcon,
  ChevronDownIcon,
  EyeOffIcon,
  MergeIcon,
  ShieldIcon,
  Undo2Icon,
  XIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ConsolidationSuggestion } from '@/interface/rule';
import { capitalize, cn } from '@/lib/utils';

/**
 * Acima disto, "criar exceções e aplicar" para de ser um clique rápido e passa
 * a ser dezenas de regras novas de uma vez, sem revisão individual — o mesmo
 * risco que o resto desta tela evita. Na base de referência a mais cheia tinha
 * 7; o teto é generoso de propósito, para não travar o caso real.
 */
const MAX_QUICK_EXCEPTIONS = 15;

/**
 * Agrupa os títulos em conflito por categoria: "vestuário (5), saúde (4)" diz
 * mais, em menos espaço, que vinte e dois títulos enfileirados.
 */
function byCategory(conflicts: ConsolidationSuggestion['conflicts']): string {
  const tally = new Map<string, number>();
  for (const { category } of conflicts) tally.set(category, (tally.get(category) ?? 0) + 1);

  return [...tally]
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => `${capitalize(category)} (${count})`)
    .join(', ');
}

export interface ConsolidationActions {
  onApply: (s: ConsolidationSuggestion) => Promise<void>;
  /**
   * Aplica preservando os títulos de `conflicts` na categoria de agora, cada
   * um virando regra `exact` antes do trecho entrar.
   */
  onApplyWithExceptions: (s: ConsolidationSuggestion) => Promise<void>;
  onDismiss: (s: ConsolidationSuggestion) => Promise<void>;
  onRestore: (s: ConsolidationSuggestion) => Promise<void>;
}

function Suggestion({
  suggestion,
  onApply,
  onApplyWithExceptions,
  onDismiss,
}: {
  suggestion: ConsolidationSuggestion;
} & Pick<ConsolidationActions, 'onApply' | 'onApplyWithExceptions' | 'onDismiss'>) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const blocked = suggestion.conflicts.length > 0;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={cn('px-4 py-3 sm:px-5', busy && 'opacity-50')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={blocked ? 'destructive' : 'primary'}>
              {blocked ? 'bloqueada' : 'segura'}
            </Badge>
            <span className="font-medium">{capitalize(suggestion.category)}</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              contém “{suggestion.value}”
            </code>
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            substitui{' '}
            <span className="tabular font-medium text-foreground">
              {suggestion.replaces.length}
            </span>{' '}
            regras
            {suggestion.captures.length > 0 && (
              <>
                {' '}
                · alcança{' '}
                <span className="tabular font-medium text-foreground">
                  {suggestion.captures.length}
                </span>{' '}
                títulos hoje em outros
              </>
            )}
          </p>

          {blocked && (
            <button
              type="button"
              onClick={() => setOpen((previous) => !previous)}
              aria-expanded={open}
              className="mt-1.5 flex items-start gap-1.5 text-left text-xs text-destructive hover:underline"
            >
              <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>
                levaria junto {suggestion.conflicts.length} títulos de {byCategory(suggestion.conflicts)}
                <ChevronDownIcon
                  className={cn('ml-1 inline size-3.5 transition-transform', open && 'rotate-180')}
                />
              </span>
            </button>
          )}

          {open && (
            <>
              <ul className="mt-2 space-y-0.5 border-l-2 border-destructive/40 pl-3">
                {suggestion.conflicts.map(({ title, category }) => (
                  <li key={title} className="truncate text-xs text-muted-foreground">
                    {title} <span className="text-destructive">→ {capitalize(category)}</span>
                  </li>
                ))}
              </ul>

              {/*
               * Os dois botões moram aqui dentro, e não ao lado do da segura,
               * porque só fazem sentido depois de ler a lista acima. Não é
               * proteção — o servidor aplica os dois se mandarem —, é recusa de
               * fingir que consolidar é uma decisão só: uma muda a categoria de
               * quem está em conflito, a outra preserva cada um deles.
               */}
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => run(() => onApply(suggestion))}
                >
                  <MergeIcon className="size-3.5" />
                  Consolidar mesmo assim
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || suggestion.conflicts.length > MAX_QUICK_EXCEPTIONS}
                  title={
                    suggestion.conflicts.length > MAX_QUICK_EXCEPTIONS
                      ? `Mais de ${MAX_QUICK_EXCEPTIONS} exceções de uma vez pede revisão individual, não um clique só.`
                      : `Cria ${suggestion.conflicts.length === 1 ? 'uma regra exata' : `${suggestion.conflicts.length} regras exatas`} para manter estes títulos onde estão, e aplica o resto.`
                  }
                  onClick={() => run(() => onApplyWithExceptions(suggestion))}
                >
                  <ShieldIcon className="size-3.5" />
                  Manter exceções e aplicar
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {!blocked && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => run(() => onApply(suggestion))}
            >
              <MergeIcon className="size-3.5" />
              Consolidar
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            aria-label={`Descartar a sugestão “contém ${suggestion.value}” em ${capitalize(suggestion.category)}`}
            title="Não me mostre mais esta sugestão"
            onClick={() => run(() => onDismiss(suggestion))}
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      </div>
    </li>
  );
}

/**
 * As descartadas, atrás de um clique.
 *
 * Ficam na tela — encolhidas — em vez de sumirem: o descarte é um julgamento
 * feito com os números de hoje, e a próxima fatura muda os números. Sem um lugar
 * onde revê-lo, a única forma de voltar atrás seria mexer no banco.
 */
function Dismissed({
  suggestions,
  onRestore,
}: {
  suggestions: ConsolidationSuggestion[];
} & Pick<ConsolidationActions, 'onRestore'>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-xs text-muted-foreground hover:text-foreground sm:px-5"
      >
        <EyeOffIcon className="size-3.5 shrink-0" />
        <span className="tabular">{suggestions.length}</span>
        <span>{suggestions.length === 1 ? 'descartada' : 'descartadas'}</span>
        <ChevronDownIcon className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <ul className="divide-y divide-border border-t border-border">
          {suggestions.map((suggestion) => (
            <li
              key={`${suggestion.category}-${suggestion.value}`}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-5"
            >
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {capitalize(suggestion.category)}
                </span>{' '}
                <code className="rounded bg-muted px-1.5 py-0.5">contém “{suggestion.value}”</code>{' '}
                · substitui <span className="tabular">{suggestion.replaces.length}</span> regras
              </p>
              <Button size="sm" variant="ghost" onClick={() => onRestore(suggestion)}>
                <Undo2Icon className="size-3.5" />
                Restaurar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ConsolidationPanel({
  suggestions,
  onApply,
  onApplyWithExceptions,
  onDismiss,
  onRestore,
}: { suggestions: ConsolidationSuggestion[] } & ConsolidationActions) {
  if (suggestions.length === 0) return null;

  const open = suggestions.filter((s) => !s.dismissed);
  const dismissed = suggestions.filter((s) => s.dismissed);
  const safe = open.filter((s) => s.conflicts.length === 0).length;

  return (
    <Card className="mb-4 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle>Onde dá para juntar</CardTitle>
        <CardDescription>
          Regras de título exato que um trecho cobriria de uma vez — e que passariam a alcançar
          também o sufixo novo que ainda vai chegar.{' '}
          {open.length === 0
            ? 'Nenhuma pendente.'
            : `${safe} de ${open.length} sem conflito.`}
        </CardDescription>
      </CardHeader>

      {open.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {open.map((suggestion) => (
            <Suggestion
              key={`${suggestion.category}-${suggestion.value}`}
              suggestion={suggestion}
              onApply={onApply}
              onApplyWithExceptions={onApplyWithExceptions}
              onDismiss={onDismiss}
            />
          ))}
        </ul>
      )}

      {dismissed.length > 0 && <Dismissed suggestions={dismissed} onRestore={onRestore} />}
    </Card>
  );
}
