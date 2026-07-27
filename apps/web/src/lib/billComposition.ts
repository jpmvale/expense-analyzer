import type Bill from '@/interface/bill';

/** Chave do balde que junta tudo que não entrou no topo. */
export const REST_KEY = '__demais__';

/** Quantas categorias ganham cor própria. Acima disso a cor perde significado. */
export const TOP_CATEGORIES = 6;

export interface CompositionPoint {
  month: string;
  /** Soma dos gastos do mês, incluindo o que caiu em "demais". */
  total: number;
  /** Um valor por categoria do topo, mais `REST_KEY`. Ausente = zero no mês. */
  values: Record<string, number>;
}

export interface Composition {
  /** Categorias com cor própria, da maior para a menor no período inteiro. */
  categories: string[];
  points: CompositionPoint[];
  /** Se sobrou alguma categoria fora do topo — define se a faixa "demais" existe. */
  hasRest: boolean;
}

/**
 * Prepara a composição mensal para o gráfico empilhado.
 *
 * Só as `TOP_CATEGORIES` maiores do período inteiro ganham faixa própria; o resto
 * vira "demais", em cinza. O corte não é estético: acima de seis ou sete classes
 * de cor as vizinhas passam a se confundir, e a paleta deixa de distinguir.
 *
 * O topo é calculado sobre o período inteiro, e não mês a mês, de propósito — a
 * cor precisa significar sempre a mesma categoria. Se cada mês elegesse o próprio
 * top 6, a mesma faixa azul seria supermercado num mês e transporte no outro, e o
 * gráfico viraria ruído colorido.
 */
export function buildComposition(bills: Bill[], topN = TOP_CATEGORIES): Composition {
  const totals = new Map<string, number>();
  for (const bill of bills) {
    for (const { categoryByMonth, totalCategory } of bill.categoriesResult) {
      totals.set(categoryByMonth, (totals.get(categoryByMonth) ?? 0) + totalCategory);
    }
  }

  const ranked = [...totals.entries()]
    .sort(([aName, aTotal], [bName, bTotal]) =>
      bTotal === aTotal ? aName.localeCompare(bName, 'pt-BR') : bTotal - aTotal,
    )
    .map(([category]) => category);

  const categories = ranked.slice(0, topN);
  const top = new Set(categories);
  const hasRest = ranked.length > categories.length;

  const points = bills.map((bill) => {
    const values: Record<string, number> = {};
    let total = 0;

    for (const { categoryByMonth, totalCategory } of bill.categoriesResult) {
      const key = top.has(categoryByMonth) ? categoryByMonth : REST_KEY;
      values[key] = (values[key] ?? 0) + totalCategory;
      total += totalCategory;
    }

    return { month: bill.month, total, values };
  });

  return { categories, points, hasRest };
}
