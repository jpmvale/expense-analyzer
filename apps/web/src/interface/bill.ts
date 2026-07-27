export interface CategoryBreakdown {
  categoryByMonth: string;
  totalCategory: number;
  frequency: number;
  percentage: number;
}

/**
 * Uma fatura (mês de referência). Além dos campos fixos, a API devolve uma chave
 * por categoria com o percentual do mês — daí a assinatura de índice, que é o
 * que permite as colunas de categoria da tabela.
 */
interface Bill {
  month: string;
  valuePaid: number;
  total: number;
  frequency: number;
  categoriesResult: CategoryBreakdown[];
  [category: string]: unknown;
}

export default Bill;
