import { PAYMENT_CATEGORY } from './purchase-filter';

export interface CategoryBreakdown {
  categoryByMonth: string;
  totalCategory: number;
  frequency: number;
  percentage: number;
}

/**
 * Além dos campos fixos, cada fatura carrega uma chave por categoria com o
 * percentual do mês (`supermercado: 12.5`) — é assim que a tabela do front
 * monta as colunas de categoria sem precisar conhecer o breakdown completo.
 */
export type Bill = {
  month: string;
  valuePaid: number;
  total: number;
  frequency: number;
  categoriesResult: CategoryBreakdown[];
} & Record<string, unknown>;

/** Só o que a agregação precisa saber de uma compra — desacopla do Mongoose. */
export interface AggregatablePurchase {
  amount: number;
  category: string;
  referenceMonth: Date;
}

/** `YYYY-MM`, com o mês sempre em dois dígitos para ordenar como texto. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const bucket = groups.get(key(item));
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(key(item), [item]);
    }
  }
  return groups;
}

export function buildBill(month: string, monthPurchases: AggregatablePurchase[]): Bill {
  // Todos os pagamentos do mês, não só o primeiro: há faturas pagas em duas ou
  // três parcelas, e pegar só uma subestimava o valor pago em milhares de reais.
  const payments = monthPurchases.filter((p) => p.category === PAYMENT_CATEGORY);
  const paid = payments.reduce((acc, p) => acc + p.amount, 0);

  // Estornos vêm com valor negativo e abatem o gasto: gastou 100 e estornou 30,
  // o mês conta 70. É o que a fatura de fato cobrou, e é o que mantém este
  // endpoint de acordo com o /purchase, que lista as mesmas linhas.
  const spending = monthPurchases.filter((p) => p.category !== PAYMENT_CATEGORY);
  const total = spending.reduce((acc, purchase) => acc + purchase.amount, 0);

  const categoriesResult: CategoryBreakdown[] = [...groupBy(spending, (p) => p.category)].map(
    ([category, items]) => {
      const totalCategory = items.reduce((acc, purchase) => acc + purchase.amount, 0);
      return {
        categoryByMonth: category,
        totalCategory: round(totalCategory),
        frequency: items.length,
        // Sem gastos no mês a divisão seria 0/0 (NaN) e quebraria o JSON.
        percentage: total > 0 ? round((totalCategory * 100) / total) : 0,
      };
    },
  );

  const percentageByCategory = Object.fromEntries(
    categoriesResult.map((c) => [c.categoryByMonth, c.percentage]),
  );

  return {
    month,
    // O CSV do Nubank traz o pagamento como negativo (é crédito na fatura), e o
    // seed o gera positivo. O módulo cobre os dois sem depender da convenção da
    // fonte — "Valor pago" é uma quantia, e quantia não tem sinal.
    valuePaid: round(Math.abs(paid)),
    total: round(total),
    // Conta só as compras. O pagamento da fatura é um lançamento, mas a coluna
    // da tela se chama "Compras" — incluí-lo deixava o número sempre +1.
    frequency: spending.length,
    categoriesResult,
    ...percentageByCategory,
  };
}

/** Uma fatura por mês de referência, em ordem cronológica. */
export function buildBills(purchases: AggregatablePurchase[]): Bill[] {
  return [...groupBy(purchases, (p) => monthKey(p.referenceMonth))]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthPurchases]) => buildBill(month, monthPurchases));
}
