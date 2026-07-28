import type { CategoryBreakdown } from './bill';
import type Purchase from './purchase';

/** Ponto do gráfico "Gasto por mês" — agrupado pela **data da compra**. */
export interface MonthPoint {
  month: string;
  total: number;
  count: number;
}

/**
 * Resposta de `GET /purchase`.
 *
 * `purchases` é **uma página**; todo o resto descreve o filtro inteiro. A
 * distinção é a razão de a resposta ter esta forma: os painéis respondem "onde o
 * dinheiro foi neste recorte", e calculá-los sobre as cinquenta linhas visíveis
 * diria outra coisa sem avisar.
 */
interface ListPurchase {
  purchases: Purchase[];
  /** Linhas que o filtro alcança, não as da página. */
  total: number;
  sum: number;
  average: number;
  page: number;
  limit: number;
  pageCount: number;
  byMonth: MonthPoint[];
  byCategory: CategoryBreakdown[];
}

export default ListPurchase;
