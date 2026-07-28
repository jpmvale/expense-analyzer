import { normalize } from './keywords';

/**
 * Como uma regra alcança as compras.
 *
 * `exact` é o que nasce de um clique na tela: o usuário diz que
 * "Mercadolivre*Mercadol" é mercado livre e todas as compras com esse título
 * exato herdam. `contains` é a promoção manual dessa regra para o trecho —
 * `mercadolivre` pega também `Mercadolivre*Mercadoli` e as outras variações que
 * o emissor inventa a cada mês.
 */
export type RuleKind = 'exact' | 'contains';

export interface CategoryRule {
  kind: RuleKind;
  /** Título inteiro (`exact`) ou o trecho a procurar nele (`contains`). */
  value: string;
  category: string;
  /** Desempate entre regras igualmente específicas. A mais nova ganha. */
  updatedAt?: Date;
}

/**
 * A comparação acontece normalizada dos dois lados: o emissor alterna entre
 * `MERCADOLIVRE*MERCADOL` e `Mercadolivre*Mercadol` para o mesmo lugar, e uma
 * regra que casasse por caixa exigiria uma cópia por variação.
 *
 * Nada aqui vira expressão regular. Títulos de fatura são cheios de `*`, `(` e
 * `+` — `Mercadolivre*Mercadol` como regex casaria com "Mercadolivr" seguido de
 * qualquer coisa. Comparar strings evita a classe inteira do problema, e é
 * também por isso que a reaplicação no banco resolve os títulos aqui, em
 * memória, e só então grava por `$in`.
 */
export function ruleMatches(rule: CategoryRule, title: string): boolean {
  // Uma regra em branco casaria com todo título e jogaria a base inteira numa
  // categoria só. O espaço à direita, esse, é significativo — um trecho como
  // `posto ` existe justamente para não pegar "postoperatório" —, então a regra
  // é descartada por ser vazia, nunca aparada.
  if (rule.value.trim() === '') return false;

  const haystack = normalize(title);
  const needle = normalize(rule.value);
  return rule.kind === 'exact' ? haystack === needle : haystack.includes(needle);
}

/**
 * Ordena da regra mais fraca para a mais forte, para que "aplique em ordem, a
 * última vence" seja a única definição de precedência no projeto — a mesma na
 * resolução em memória e na gravação em lote.
 *
 * A escada:
 *
 * 1. `contains` perde para `exact`. Quem apontou o título inteiro foi mais
 *    específico do que quem descreveu um pedaço dele.
 * 2. Entre dois `contains`, ganha o trecho mais longo. `mercadolivre*mercadol`
 *    diz mais sobre a compra do que `mercado`, que pegaria meio supermercado
 *    junto.
 * 3. No empate, a mais recente. Se o usuário reclassificou algo hoje, é porque
 *    a classificação de antes não servia mais.
 */
export function sortRulesByPrecedence<T extends CategoryRule>(rules: T[]): T[] {
  const kindRank = (kind: RuleKind) => (kind === 'exact' ? 1 : 0);
  const at = (rule: CategoryRule) => rule.updatedAt?.getTime() ?? 0;

  return [...rules].sort(
    (a, b) =>
      kindRank(a.kind) - kindRank(b.kind) ||
      normalize(a.value).length - normalize(b.value).length ||
      at(a) - at(b),
  );
}

/**
 * A regra que ganha este título, ou `null` se nenhuma o alcança.
 *
 * É genérica de propósito: quem chama passa o documento do banco e recebe **o
 * mesmo documento** de volta, com `_id` e tudo. Sem isso não daria para dizer
 * quantas compras cada regra governa, que é a diferença entre listar 255 regras
 * e conseguir revisá-las.
 *
 * "Ganha" é a última da ordem de precedência que casa — a mesma definição que a
 * reaplicação usa para gravar. Ter as duas coisas saindo daqui é o que impede a
 * tela de dizer que uma regra manda em compras que, no banco, obedecem a outra.
 */
export function ruleForTitle<T extends CategoryRule>(title: string, rules: T[]): T | null {
  let winner: T | null = null;
  for (const rule of sortRulesByPrecedence(rules)) {
    if (ruleMatches(rule, title)) winner = rule;
  }
  return winner;
}

/** A categoria que as regras dão a este título, ou `null` se nenhuma o alcança. */
export function categoryFromRules(title: string, rules: CategoryRule[]): string | null {
  return ruleForTitle(title, rules)?.category ?? null;
}

export interface TitleAssignment {
  /** Os títulos que as regras reivindicam, agrupados pela categoria de destino. */
  byCategory: Map<string, string[]>;
  /** Os títulos que nenhuma regra alcança — voltam para a categoria da ingestão. */
  unruled: string[];
}

/**
 * Resolve de uma vez todos os títulos distintos da base.
 *
 * Agrupar por categoria de destino é o que transforma a reaplicação em um
 * punhado de escritas: um `updateMany` por categoria envolvida, em vez de um por
 * regra. Com duzentas regras apontando para quinze categorias, são quinze idas
 * ao banco.
 */
export function assignTitles(titles: string[], rules: CategoryRule[]): TitleAssignment {
  const ordered = sortRulesByPrecedence(rules);
  const byCategory = new Map<string, string[]>();
  const unruled: string[] = [];

  for (const title of titles) {
    let category: string | null = null;
    for (const rule of ordered) {
      if (ruleMatches(rule, title)) category = rule.category;
    }

    if (category === null) {
      unruled.push(title);
      continue;
    }

    const bucket = byCategory.get(category);
    if (bucket) bucket.push(title);
    else byCategory.set(category, [title]);
  }

  return { byCategory, unruled };
}
