import { AlertCircleIcon, CheckCircle2Icon, ListChecksIcon, SearchIcon, TagsIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConsolidationPanel } from '@/components/consolidation-panel';
import { CategoryFilter } from '@/components/filters/category-filter';
import { PageHeader } from '@/components/layout/app-shell';
import { NewRuleForm, type NewRuleRequest } from '@/components/new-rule-form';
import { RulesList } from '@/components/rules-list';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { Category } from '@/interface/category';
import type { ConsolidationSuggestion, RuleUsage } from '@/interface/rule';
import { capitalize } from '@/lib/utils';
import {
  consolidateRules,
  deleteRule,
  listCategories,
  listConsolidations,
  listRules,
  saveRule,
} from '../../api/client';

/** Mesma normalização do servidor: caixa e acento não distinguem uma busca. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Quantas regras a lista mostra de saída.
 *
 * Com 255 delas, despejar tudo faz a página nascer com dez mil pixels de
 * rolagem e nenhum ponto de entrada. O filtro é o caminho normal daqui; o botão
 * existe para quem quer mesmo varrer.
 */
const PAGE_SIZE = 50;

function Rules() {
  const [rules, setRules] = useState<RuleUsage[]>([]);
  const [suggestions, setSuggestions] = useState<ConsolidationSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);

  // As categorias em que dá para apontar uma regra — vêm da API, e não das
  // regras já existentes, porque incluem as que o usuário criou e ainda não usou.
  const [categories, setCategories] = useState<Category[]>([]);

  const load = useCallback(async () => {
    const [usage, consolidations, known] = await Promise.all([
      listRules(),
      listConsolidations(),
      listCategories(),
    ]);
    setRules(usage);
    setSuggestions(consolidations);
    setCategories(known);
  }, []);

  useEffect(() => {
    load()
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [load]);

  const options = useMemo(
    () => [...new Set(rules.map((rule) => rule.category))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [rules],
  );

  const filtered = useMemo(() => {
    const needle = normalize(search.trim());
    return rules.filter(
      (rule) =>
        (categoryFilter.length === 0 || categoryFilter.includes(rule.category)) &&
        (needle === '' || normalize(rule.value).includes(needle)),
    );
  }, [rules, categoryFilter, search]);

  const totals = useMemo(
    () => ({
      purchases: rules.reduce((acc, rule) => acc + rule.purchases, 0),
      idle: rules.filter((rule) => rule.purchases === 0).length,
    }),
    [rules],
  );

  const hasFilters = categoryFilter.length > 0 || search !== '';

  /**
   * Executa a escrita, recarrega e conta o que mudou.
   *
   * As duas ações desta tela mexem no banco e mudam a lista inteira — apagar uma
   * regra devolve compras, consolidar apaga várias —, então nenhuma delas pode
   * atualizar estado local: recarregar do servidor é a única leitura que bate
   * com o que ficou gravado.
   */
  const run = useCallback(
    async (action: () => Promise<string>) => {
      setError(null);
      try {
        const message = await action();
        await load();
        setDone(message);
      } catch (cause) {
        setDone(null);
        setError((cause as Error).message);
      }
    },
    [load],
  );

  const remove = useCallback(
    (rule: RuleUsage) =>
      run(async () => {
        const { restored } = await deleteRule(rule._id);
        return `Regra apagada. ${restored} ${restored === 1 ? 'compra voltou' : 'compras voltaram'} à categoria da fatura.`;
      }),
    [run],
  );

  const consolidate = useCallback(
    (suggestion: ConsolidationSuggestion) =>
      run(async () => {
        const { deleted, classified } = await consolidateRules({
          value: suggestion.value,
          category: suggestion.category,
        });
        return `${deleted} regras viraram uma. ${classified} compras reclassificadas em ${capitalize(suggestion.category)}.`;
      }),
    [run],
  );

  /**
   * Muda o destino de uma regra que já existe. Reaproveita o mesmo `POST` que
   * cria: `kind` e `value` ficam iguais, então a API acha a regra pelo par e
   * atualiza a categoria em vez de duplicar — não existe rota própria para isso.
   */
  const editRule = useCallback(
    (rule: RuleUsage, category: string) =>
      run(async () => {
        const { classified } = await saveRule({ kind: rule.kind, value: rule.value, category });
        return `${classified} ${classified === 1 ? 'compra passou' : 'compras passaram'} para ${capitalize(category)}.`;
      }),
    [run],
  );

  const createRule = useCallback(
    ({ kind, value, category }: NewRuleRequest) =>
      run(async () => {
        const { classified } = await saveRule({ kind, value, category });
        return `${classified} ${classified === 1 ? 'compra foi' : 'compras foram'} para ${capitalize(category)}.`;
      }),
    [run],
  );

  return (
    <>
      <PageHeader
        title="Regras"
        description="As decisões de classificação que você tomou. Cada uma vale para todas as compras do título, inclusive as das próximas faturas."
      />

      {error && (
        <Card className="mb-4 flex items-start gap-3 border-destructive/40 p-4 text-sm">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Não deu para concluir.</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </div>
        </Card>
      )}

      {done && !error && (
        <Card className="mb-4 flex items-start gap-3 border-primary/40 p-4 text-sm">
          <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>{done}</p>
        </Card>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Regras"
          value={rules.length.toLocaleString('pt-BR')}
          Icon={ListChecksIcon}
          loading={loading}
        />
        <StatCard
          label="Compras governadas"
          value={totals.purchases.toLocaleString('pt-BR')}
          hint="pela regra que de fato manda em cada uma"
          Icon={TagsIcon}
          loading={loading}
        />
        <StatCard
          label="Sem alcance hoje"
          value={totals.idle.toLocaleString('pt-BR')}
          hint="regra que não governa nenhuma compra"
          Icon={XIcon}
          loading={loading}
        />
      </div>

      {loading ? (
        <Card className="space-y-2 p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </Card>
      ) : (
        <>
          <ConsolidationPanel suggestions={suggestions} onApply={consolidate} />

          <NewRuleForm categories={categories} onCreate={createRule} />

          <Card className="mb-4 p-3 sm:p-4">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <CategoryFilter options={options} value={categoryFilter} onChange={setCategoryFilter} />
              <div className="relative">
                <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setVisible(PAGE_SIZE);
                  }}
                  placeholder="Buscar no título ou trecho…"
                  aria-label="Buscar no título ou trecho da regra"
                  className="pl-9"
                />
              </div>
              {hasFilters && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCategoryFilter([]);
                    setSearch('');
                  }}
                  className="justify-start sm:justify-center"
                >
                  <XIcon />
                  Limpar
                </Button>
              )}
            </div>
            <p className="tabular mt-2 text-xs text-muted-foreground">
              {filtered.length} de {rules.length} regras
            </p>
          </Card>

          <RulesList
            rules={filtered.slice(0, visible)}
            categories={categories}
            onDelete={remove}
            onEdit={editRule}
          />

          {visible < filtered.length && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => setVisible((n) => n + PAGE_SIZE)}>
                Mostrar mais {Math.min(PAGE_SIZE, filtered.length - visible)} de{' '}
                {filtered.length - visible}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default Rules;
