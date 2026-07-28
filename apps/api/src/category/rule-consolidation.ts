import { FALLBACK_CATEGORY, normalize, ruleForTitle, type CategoryRule } from '@expense/categorization';

/** Um título da base e a categoria que ele tem hoje. */
export interface RuledTitle {
  title: string;
  category: string;
}

export interface ConsolidationSuggestion<T extends CategoryRule = CategoryRule> {
  category: string;
  /** O trecho proposto, já na forma normalizada em que a regra vai casar. */
  value: string;
  /** As regras `exact` que ele torna desnecessárias. */
  replaces: T[];
  /**
   * Títulos hoje em `outros` que o trecho passaria a capturar.
   *
   * É o outro lado da consolidação e a razão de ela valer mais que arrumação:
   * a regra por trecho não só substitui as que existem, ela alcança o que ainda
   * vai chegar com sufixo novo — que é de onde a fila de classificação se
   * realimenta.
   */
  captures: string[];
  /**
   * Títulos que o trecho tomaria de outra categoria. Vazio significa seguro.
   *
   * Uma sugestão com conflito **não** é aplicável, e mesmo assim é devolvida —
   * é a informação mais útil que esta análise produz. Nesta base, `shopee`
   * cobriria 52 regras e levaria junto 22 títulos que estão em `vestuário`,
   * `saúde` e `eletrônicos`, porque a Shopee é um marketplace e a classificação
   * segue o que foi comprado, não onde. Sem mostrar isso, a tela ou silencia a
   * maior alavanca da base ou mente sobre ela.
   */
  conflicts: Array<{ title: string; category: string }>;
}

/**
 * Abaixo de quatro caracteres um trecho é ganancioso demais: `pag` casaria com
 * "Pagamento", "Pague", "Pagliari".
 */
const MIN_VALUE_LENGTH = 4;

/**
 * Consolidar duas regras em uma não paga o risco de generalizar. A partir de
 * três, paga.
 */
const MIN_REPLACES = 3;

/**
 * Os trechos que vale testar para uma regra: prefixos cortados em fronteira.
 *
 * Cortar em fronteira — e não em qualquer posição — é o que faz o candidato ser
 * legível para quem vai aprová-lo. De `Shopee *Inpower` saem `shopee`,
 * `shopee ` e `shopee *`, não `shope` nem `shopee *inpo`. O espaço e o
 * asterisco ficam dentro do candidato de propósito: `shopee ` não pega
 * "shopeepay", e essa diferença já importou nesta base.
 */
function candidatePrefixes(value: string): string[] {
  const normalized = normalize(value);
  const isSeparator = (char: string | undefined) =>
    char !== undefined && !/[a-z0-9]/.test(char);

  const found = new Set<string>();
  for (let i = MIN_VALUE_LENGTH; i <= normalized.length; i++) {
    // Fim da string, ou o próximo caractere abre uma fronteira: `shopee`.
    if (i === normalized.length || isSeparator(normalized[i])) found.add(normalized.slice(0, i));
    // Logo depois de uma fronteira: `shopee ` e `shopee *`.
    if (isSeparator(normalized[i - 1])) found.add(normalized.slice(0, i));
  }
  return [...found];
}

/**
 * Sugere trocar um punhado de regras `exact` por uma `contains`.
 *
 * O gatilho é concreto: nesta base, `Shopee` tem 57 regras, 52 delas apontando
 * para títulos que só diferem no sufixo (`Shopee *Inpower`, `Shopee *Sieno`).
 * Cada compra nova com sufixo novo volta para a fila de classificação, e
 * classificá-la cria a 58ª regra. Sem uma tela que mostre o padrão, o trabalho
 * é infinito por construção.
 *
 * **Conflito zero é requisito, não preferência.** Um candidato é descartado se
 * mudaria a categoria de qualquer título que hoje está numa categoria de
 * verdade — só `outros` pode ser capturado, porque ali não há classificação a
 * desrespeitar. É por isso que a função precisa dos títulos com suas categorias
 * atuais, e não apenas das regras: o risco de uma regra por trecho não está no
 * que ela substitui, está no que ela alcança sem querer.
 *
 * A verificação usa `ruleForTitle`, a mesma escada que a reaplicação usa para
 * gravar. Um título protegido pela própria regra `exact` não conta como
 * conflito, porque `exact` continua ganhando de `contains` depois da troca.
 */
export function suggestConsolidations<T extends CategoryRule>(
  rules: T[],
  titles: RuledTitle[],
): Array<ConsolidationSuggestion<T>> {
  // O vencedor de cada título hoje, calculado uma vez: é o que permite saber,
  // por candidato, quem de fato mudaria de dono.
  const winners = new Map<string, T | null>(
    titles.map(({ title }) => [title, ruleForTitle(title, rules)]),
  );

  const byCategory = new Map<string, T[]>();
  for (const rule of rules) {
    if (rule.kind !== 'exact') continue;
    const bucket = byCategory.get(rule.category);
    if (bucket) bucket.push(rule);
    else byCategory.set(rule.category, [rule]);
  }

  const suggestions: Array<ConsolidationSuggestion<T>> = [];

  for (const [category, exact] of byCategory) {
    if (exact.length < MIN_REPLACES) continue;

    let safest: ConsolidationSuggestion<T> | null = null;
    let widest: ConsolidationSuggestion<T> | null = null;

    for (const candidate of new Set(exact.flatMap((rule) => candidatePrefixes(rule.value)))) {
      const replaces = exact.filter((rule) => normalize(rule.value).includes(candidate));
      if (replaces.length < MIN_REPLACES) continue;

      const captures: string[] = [];
      const conflicts: Array<{ title: string; category: string }> = [];

      for (const { title, category: current } of titles) {
        if (current === category) continue;
        if (!normalize(title).includes(candidate)) continue;

        // `exact` continua ganhando de `contains`: quem tem regra própria não
        // muda de dono, e portanto não é conflito.
        const winner = winners.get(title) ?? null;
        if (winner?.kind === 'exact') continue;

        // Entre dois `contains` vence o trecho mais longo. Um trecho mais curto
        // que o vencedor de hoje não tomaria o título.
        if (winner?.kind === 'contains' && normalize(winner.value).length > candidate.length) {
          continue;
        }

        if (current === FALLBACK_CATEGORY) captures.push(title);
        else conflicts.push({ title, category: current });
      }

      const found: ConsolidationSuggestion<T> = { category, value: candidate, replaces, captures, conflicts };

      // Empate em cobertura: fica o trecho mais longo, que é o mais específico
      // e o que menos promete alcançar coisa que ninguém previu.
      const beats = (a: ConsolidationSuggestion<T>, b: ConsolidationSuggestion<T> | null) =>
        !b ||
        a.replaces.length > b.replaces.length ||
        (a.replaces.length === b.replaces.length && a.value.length > b.value.length);

      if (beats(found, widest)) widest = found;
      if (conflicts.length === 0 && beats(found, safest)) safest = found;
    }

    // A segura, quando existe. E a mais ampla junto, quando ela cobre mais e
    // está bloqueada: é ali que mora a alavanca da base, e o conflito é o preço
    // dela — dois números que só valem lidos lado a lado.
    if (safest) suggestions.push(safest);
    if (widest && widest.conflicts.length > 0 && widest.replaces.length > (safest?.replaces.length ?? 0)) {
      suggestions.push(widest);
    }
  }

  // Maior economia primeiro: é a ordem em que compensa revisar.
  return suggestions.sort(
    (a, b) => b.replaces.length + b.captures.length - (a.replaces.length + a.captures.length),
  );
}
