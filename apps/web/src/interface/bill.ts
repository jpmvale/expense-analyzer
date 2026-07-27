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
  /**
   * Último dia de compra do ciclo, `YYYY-MM-DD`. `month` nomeia o mês em que a
   * fatura **vence**, e o consumo dela vem do mês anterior: a de agosto/2026
   * fecha em 26/07/2026. Comparar com hoje é o que diz se a fatura fechou —
   * comparar `month` com o mês corrente descarta um ciclo inteiro.
   */
  cycleEnd: string;
  valuePaid: number;
  total: number;
  /**
   * Juros, multa e saldo rolado do mês. Fica **fora** do `total`: é o custo de
   * financiar, não consumo. Some da composição por categoria pelo mesmo motivo.
   */
  charges: number;
  frequency: number;
  categoriesResult: CategoryBreakdown[];
  [category: string]: unknown;
}

export default Bill;
