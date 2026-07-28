import type { SortableField, SortOrder } from '@/api/client';

export interface Sort {
  key: SortableField;
  direction: SortOrder;
}

/**
 * A tela abre no que aconteceu agora, não em 2018.
 *
 * O servidor aplica o mesmo padrão quando ninguém pede ordem. A repetição é
 * deliberada: a tabela precisa saber qual seta acender antes de a primeira
 * resposta chegar.
 */
export const DEFAULT_SORT: Sort = { key: 'date', direction: 'desc' };

/** O teto de 250 é o mesmo da API, que recusa acima disso. */
export const PAGE_SIZES = [25, 50, 100, 250];

/**
 * Colunas em que o primeiro clique já ordena do maior para o menor: em valor e
 * data, "maior primeiro" é a pergunta que se faz — quais foram as maiores
 * compras, quais foram as mais recentes. Em texto, a ordem alfabética é a
 * natural.
 */
const DESC_FIRST: SortableField[] = ['amount', 'date', 'referenceMonth'];

/**
 * O que clicar num cabeçalho faz.
 *
 * Sempre sobra uma ordenação: o terceiro clique não volta à ordem "natural" da
 * API, que hoje nem existe mais como estado — o servidor sempre ordena por
 * alguma coisa, e um estado sem nome na tela seria só confusão.
 */
export function nextSort(current: Sort, key: SortableField): Sort {
  if (current.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: DESC_FIRST.includes(key) ? 'desc' : 'asc' };
}
