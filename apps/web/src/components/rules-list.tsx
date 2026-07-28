import { Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { CategoryPicker } from '@/components/category-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Category } from '@/interface/category';
import type { RuleUsage } from '@/interface/rule';
import { capitalize, cn, formatDate } from '@/lib/utils';

function Row({
  rule,
  categories,
  onDelete,
  onEdit,
}: {
  rule: RuleUsage;
  categories: Category[];
  onDelete: (rule: RuleUsage) => Promise<void>;
  onEdit: (rule: RuleUsage, category: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <li className={cn('flex items-start gap-3 px-4 py-2.5 sm:px-5', busy && 'opacity-50')}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={rule.kind === 'contains' ? 'default' : 'outline'}>
            {rule.kind === 'contains' ? 'contém' : 'exato'}
          </Badge>
          <span className="truncate text-sm font-medium">{rule.value}</span>

          {/*
           * O destino é o que se erra olhando a lista, e a correção fica onde o
           * erro é notado — o mesmo raciocínio da categoria clicável na tabela de
           * Compras. Antes disso, mudar o destino de uma regra era recriá-la do
           * zero apontando para a categoria certa.
           */}
          <CategoryPicker
            categories={categories}
            value={rule.category}
            align="start"
            onSelect={async (category) => {
              setBusy(true);
              try {
                await onEdit(rule, category);
              } finally {
                setBusy(false);
              }
            }}
          >
            <button
              type="button"
              disabled={busy}
              className="rounded-sm text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground hover:decoration-solid"
              aria-label={`Mudar o destino da regra ${rule.value}`}
            >
              → {capitalize(rule.category)}
            </button>
          </CategoryPicker>
        </div>
        <p className="tabular mt-0.5 text-xs text-muted-foreground">
          {/*
           * Zero compras não é erro: pode ser regra de um lugar onde não se
           * compra mais, ou uma `exact` que uma `contains` mais nova passou a
           * cobrir. É o que a tela existe para deixar ver.
           */}
          {rule.purchases === 0 ? (
            <span className="text-destructive">não governa nenhuma compra</span>
          ) : (
            <>
              {rule.purchases} {rule.purchases === 1 ? 'compra' : 'compras'}
              {rule.titles > 1 && ` · ${rule.titles} títulos`}
            </>
          )}{' '}
          · {formatDate(rule.updatedAt)}
        </p>
      </div>

      <Button
        size="icon"
        variant="ghost"
        aria-label={`Apagar a regra ${rule.value}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onDelete(rule);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </li>
  );
}

export function RulesList({
  rules,
  categories,
  onDelete,
  onEdit,
}: {
  rules: RuleUsage[];
  categories: Category[];
  onDelete: (rule: RuleUsage) => Promise<void>;
  onEdit: (rule: RuleUsage, category: string) => Promise<void>;
}) {
  if (rules.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-muted-foreground">Nenhuma regra com esse filtro.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {rules.map((rule) => (
          <Row
            key={rule._id}
            rule={rule}
            categories={categories}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        ))}
      </ul>
    </Card>
  );
}
