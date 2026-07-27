import { ChevronDownIcon, TagIcon } from 'lucide-react';
import { useState } from 'react';
import { CategoryPicker } from '@/components/category-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Category, RuleKind, UncategorizedTitle } from '@/interface/category';
import { cn, currency, formatDate } from '@/lib/utils';

export interface ClassifyRequest {
  kind: RuleKind;
  value: string;
  category: string;
}

interface RowProps {
  group: UncategorizedTitle;
  categories: Category[];
  onClassify: (request: ClassifyRequest) => Promise<void>;
}

/**
 * O alcance da regra que este grupo vai criar.
 *
 * Fica visível antes de classificar, e não escondido no resultado, porque as
 * duas escolhas erram de lados opostos e o usuário só descobriria depois: um
 * `contains` curto demais varre categorias inteiras para o lugar errado, e um
 * `exact` deixa metade das compras do mesmo estabelecimento para trás.
 */
function ScopeControl({
  group,
  kind,
  onToggle,
}: {
  group: UncategorizedTitle;
  kind: RuleKind;
  onToggle: () => void;
}) {
  const forms = group.titles.length;
  const covered = kind === 'contains' ? forms : 1;

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      <span>Vai valer para</span>
      <button
        type="button"
        onClick={onToggle}
        className="rounded-sm font-medium text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
      >
        {kind === 'contains' ? `tudo que contém “${group.title}”` : `“${group.titles[0]}”, exato`}
      </button>
      {forms > 1 && (
        <span className={cn(covered < forms && 'text-destructive')}>
          · {covered} de {forms} formas
        </span>
      )}
    </p>
  );
}

function UncategorizedRow({ group, categories, onClassify }: RowProps) {
  const [kind, setKind] = useState<RuleKind>(group.suggestion.kind);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const value = kind === 'contains' ? group.title : group.titles[0];

  const classify = async (category: string) => {
    setBusy(true);
    try {
      await onClassify({ kind, value, category });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={cn('px-4 py-3 transition-opacity', busy && 'opacity-50')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{group.title}</p>
            {group.titles.length > 1 && (
              <button
                type="button"
                onClick={() => setOpen((previous) => !previous)}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                aria-expanded={open}
              >
                <ChevronDownIcon
                  className={cn('inline size-3.5 transition-transform', open && 'rotate-180')}
                />
                {group.titles.length} formas
              </button>
            )}
          </div>

          <p className="tabular mt-0.5 text-xs text-muted-foreground">
            {group.frequency} {group.frequency === 1 ? 'compra' : 'compras'} · última em{' '}
            {formatDate(group.lastDate)}
          </p>

          <ScopeControl
            group={group}
            kind={kind}
            onToggle={() => setKind((previous) => (previous === 'exact' ? 'contains' : 'exact'))}
          />

          {open && (
            <ul className="mt-2 space-y-0.5 border-l-2 border-border pl-3">
              {group.titles.map((title) => (
                <li key={title} className="truncate text-xs text-muted-foreground">
                  {title}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="tabular text-sm font-medium">{currency(group.total)}</span>
          <CategoryPicker categories={categories} onSelect={classify}>
            <Button variant="outline" size="sm" disabled={busy}>
              <TagIcon className="size-3.5" />
              Classificar
            </Button>
          </CategoryPicker>
        </div>
      </div>
    </li>
  );
}

export function UncategorizedList({
  groups,
  categories,
  onClassify,
}: {
  groups: UncategorizedTitle[];
  categories: Category[];
  onClassify: (request: ClassifyRequest) => Promise<void>;
}) {
  if (groups.length === 0) {
    return (
      <Card className="p-10 text-center">
        <Badge variant="primary" className="mb-3">
          Tudo classificado
        </Badge>
        <p className="text-sm text-muted-foreground">
          Nenhuma compra em “outros”. Faturas novas que chegarem sem categoria aparecem aqui.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {groups.map((group) => (
          <UncategorizedRow
            key={group.title}
            group={group}
            categories={categories}
            onClassify={onClassify}
          />
        ))}
      </ul>
    </Card>
  );
}
