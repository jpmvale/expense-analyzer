import type { PipelineStage } from 'mongoose';

/**
 * As colunas por que a tabela deixa ordenar.
 *
 * É uma lista fechada de propósito: o valor vem da query string e vira chave de
 * `sort` do Mongo, então aceitar qualquer nome deixaria o cliente ordenar por
 * campo não indexado — ou por um que nem existe, o que o Mongo aceita calado e
 * devolve numa ordem que ninguém pediu.
 */
export const SORTABLE_FIELDS = ['title', 'amount', 'category', 'referenceMonth', 'date'] as const;
export type SortableField = (typeof SORTABLE_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

/** O que a tabela abre mostrando: o mais recente primeiro. */
export const DEFAULT_SORT: SortableField = 'date';
export const DEFAULT_ORDER: SortOrder = 'desc';
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 250;

/**
 * A ordenação, sempre com `_id` como critério de desempate.
 *
 * Sem o desempate a paginação mente. Ordenando por `category`, milhares de
 * compras empatam, e o Mongo não promete manter a mesma ordem entre duas
 * consultas: a mesma compra pode aparecer na página 1 e de novo na 2, enquanto
 * outra não aparece em nenhuma. É um erro que não dá exceção nem tela vermelha —
 * só uma linha que some.
 */
export function buildSortSpec(
  field: SortableField = DEFAULT_SORT,
  order: SortOrder = DEFAULT_ORDER,
): Record<string, 1 | -1> {
  const direction = order === 'asc' ? 1 : -1;
  return { [field]: direction, _id: direction };
}

export interface Paging {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Converte página e tamanho no `skip`/`limit` do Mongo.
 *
 * A página é 1-based porque é o que a URL mostra, e o limite é preso a
 * `MAX_LIMIT`: sem teto, `?limit=999999` traria a coleção inteira e desfaria o
 * motivo de a paginação existir.
 */
export function buildPaging(page?: number, limit?: number): Paging {
  // Valor inválido cai no padrão em vez de ser espremido para dentro da faixa:
  // `limit: -5` virando 1 devolveria uma linha só, que parece resposta e não é.
  // O DTO já recusa isso antes de chegar aqui; esta é a rede de baixo.
  const asked = Math.trunc(limit ?? DEFAULT_LIMIT);
  const safeLimit = Number.isFinite(asked) && asked >= 1 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT;

  const askedPage = Math.trunc(page ?? 1);
  const safePage = Number.isFinite(askedPage) && askedPage >= 1 ? askedPage : 1;

  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
}

export interface MonthPoint {
  /** `YYYY-MM` da **data da compra** — não do mês da fatura. */
  month: string;
  total: number;
  count: number;
}

export interface CategorySlice {
  categoryByMonth: string;
  totalCategory: number;
  frequency: number;
  percentage: number;
}

/**
 * Os agregados que os painéis da tela de Compras mostram, num `$facet` só.
 *
 * Eles precisam descrever o **filtro inteiro**, e não a página aberta — o painel
 * responde "onde o dinheiro foi neste recorte", e calculá-lo sobre cinquenta
 * linhas diria outra coisa sem avisar. Antes isso era somado no cliente, o que
 * funcionava só porque a API mandava tudo.
 *
 * `$facet` porque as três agregações leem o mesmo `$match`: numa consulta só o
 * Mongo varre uma vez em vez de três.
 */
export function buildSummaryPipeline(match: Record<string, unknown>): PipelineStage[] {
  return [
    { $match: match },
    {
      $facet: {
        totals: [{ $group: { _id: null, total: { $sum: 1 }, sum: { $sum: '$amount' } } }],
        byMonth: [
          {
            $group: {
              // `timezone: 'UTC'` explícito: as compras são gravadas à meia-noite
              // UTC, e deixar o servidor decidir jogaria toda compra do dia 1º
              // para o mês anterior em fusos negativos.
              _id: { $dateToString: { format: '%Y-%m', date: '$date', timezone: 'UTC' } },
              total: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        byCategory: [
          {
            $group: {
              _id: '$category',
              totalCategory: { $sum: '$amount' },
              frequency: { $sum: 1 },
            },
          },
          // Desempate pelo nome, pelo mesmo motivo do `_id` na paginação: duas
          // categorias podem somar exatamente o mesmo, e sem critério estável o
          // painel troca a ordem delas entre uma requisição e outra.
          { $sort: { totalCategory: -1, _id: 1 } },
        ],
      },
    },
  ];
}

/** O que o `$facet` devolve, antes de ganhar forma. */
export interface FacetShape {
  totals: Array<{ total: number; sum: number }>;
  byMonth: Array<{ _id: string; total: number; count: number }>;
  byCategory: Array<{ _id: string; totalCategory: number; frequency: number }>;
}

export interface PurchaseSummary {
  total: number;
  sum: number;
  average: number;
  byMonth: MonthPoint[];
  byCategory: CategorySlice[];
}

const round = (value: number) => Number(value.toFixed(2));

/**
 * Dá forma ao resultado do `$facet`.
 *
 * O filtro que não casa com nada devolve `totals` vazio, e não um zero — daí os
 * defaults. Sem eles a tela mostraria `NaN` no lugar do total assim que alguém
 * buscasse por um título que não existe.
 */
export function toSummary(facet: FacetShape | undefined): PurchaseSummary {
  const { total = 0, sum = 0 } = facet?.totals[0] ?? {};

  return {
    total,
    sum: round(sum),
    average: total > 0 ? round(sum / total) : 0,
    byMonth: (facet?.byMonth ?? []).map(({ _id, total: monthTotal, count }) => ({
      month: _id,
      total: round(monthTotal),
      count,
    })),
    byCategory: (facet?.byCategory ?? []).map(({ _id, totalCategory, frequency }) => ({
      categoryByMonth: _id,
      totalCategory: round(totalCategory),
      frequency,
      // Percentual sobre a soma com sinal, que é o que a tela sempre mostrou.
      // Tem um limite conhecido: num recorte com muito estorno a soma encolhe e
      // as fatias podem passar de 100%. Trocar para módulo mudaria os números da
      // tela sem que ninguém tenha pedido, então fica como está.
      percentage: sum !== 0 ? (totalCategory * 100) / sum : 0,
    })),
  };
}
