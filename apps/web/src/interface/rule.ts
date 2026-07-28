import type { RuleKind } from './category';

/** Uma regra e o tamanho do que ela governa hoje. */
export interface RuleUsage {
  _id: string;
  kind: RuleKind;
  value: string;
  category: string;
  updatedAt: string;
  /** Compras que obedecem a esta regra — não as que ela casa. */
  purchases: number;
  /** Títulos distintos sob ela. Uma `exact` governa no máximo um. */
  titles: number;
}

export interface ConsolidationSuggestion {
  category: string;
  /** O trecho proposto, já normalizado. */
  value: string;
  replaces: Array<{ _id: string; value: string }>;
  /** Títulos hoje em `outros` que o trecho passaria a capturar. */
  captures: string[];
  /**
   * Títulos que o trecho tomaria de outra categoria. Vazio significa seguro; com
   * conteúdo, a sugestão não é aplicável sem uma decisão de quem lê.
   */
  conflicts: Array<{ title: string; category: string }>;
}
