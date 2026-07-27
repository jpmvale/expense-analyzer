export interface Category {
  name: string;
  /** Zero é categoria criada pelo usuário e ainda não usada por nenhuma compra. */
  purchaseCount: number;
}

export type RuleKind = 'exact' | 'contains';

export interface CategoryRule {
  _id: string;
  kind: RuleKind;
  value: string;
  category: string;
  updatedAt: string;
}

/** Um estabelecimento ainda em `outros`, com as parcelas dele já reunidas. */
export interface UncategorizedTitle {
  title: string;
  /** Os títulos crus do grupo. Mais de um significa que `exact` não basta. */
  titles: string[];
  frequency: number;
  total: number;
  lastDate: string;
  /** A regra que a API propõe para resolver o grupo inteiro de uma vez. */
  suggestion: { kind: RuleKind; value: string };
}

export interface ReapplyResult {
  classified: number;
  restored: number;
}
