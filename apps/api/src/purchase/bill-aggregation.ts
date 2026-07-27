import { FINANCING_CATEGORY, isSpendingCategory, PAYMENT_CATEGORY } from '@expense/categorization';

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
export type BillTotals = {
  month: string;
  valuePaid: number;
  total: number;
  /** Juros, multa e saldo rolado do mês. Fora do `total` — não é consumo. */
  charges: number;
  frequency: number;
  categoriesResult: CategoryBreakdown[];
} & Record<string, unknown>;

/**
 * A fatura como a API devolve: os totais do mês mais a borda do ciclo, que só se
 * conhece olhando a série inteira — daí ela nascer no `buildBills`, e não no
 * `buildBill`.
 */
export type Bill = BillTotals & {
  /**
   * Último dia de compra do ciclo, `YYYY-MM-DD`. Não é o fim do mês: `month`
   * nomeia o mês em que a fatura *vence*, e o consumo dela vem do mês anterior —
   * a fatura de agosto/2026 fecha em 26/07/2026. Quem consome compara com hoje
   * para saber se a fatura fechou; o servidor não decide isso, porque a resposta
   * mudaria de significado ao ser cacheada.
   */
  cycleEnd: string;
};

/** Só o que a agregação precisa saber de uma compra — desacopla do Mongoose. */
export interface AggregatablePurchase {
  amount: number;
  category: string;
  referenceMonth: Date;
  /**
   * Quando a compra foi feita. Diferente de `referenceMonth`, que é a fatura em
   * que ela é cobrada — e é a distância entre as duas que revela o ciclo.
   */
  date: Date;
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

export function buildBill(month: string, monthPurchases: AggregatablePurchase[]): BillTotals {
  // Todos os pagamentos do mês, não só o primeiro: há faturas pagas em duas ou
  // três parcelas, e pegar só uma subestimava o valor pago em milhares de reais.
  const payments = monthPurchases.filter((p) => p.category === PAYMENT_CATEGORY);
  const paid = payments.reduce((acc, p) => acc + p.amount, 0);

  // Encargos são o custo de financiar, não consumo: juros, multa e o saldo que
  // rolou de um mês para o outro. Somá-los ao gasto respondia "quanto você
  // gastou" com dinheiro que ninguém gastou — no histórico de referência, um
  // único "Saldo em atraso" de R$ 10.023 pesava mais que qualquer compra do ano.
  // Saem do total e ganham linha própria, porque esconder também seria mentir.
  const charges = monthPurchases
    .filter((p) => p.category === FINANCING_CATEGORY)
    .reduce((acc, purchase) => acc + purchase.amount, 0);

  // Estornos vêm com valor negativo e abatem o gasto: gastou 100 e estornou 30,
  // o mês conta 70. É o que a fatura de fato cobrou, e é o que mantém este
  // endpoint de acordo com o /purchase, que lista as mesmas linhas.
  const spending = monthPurchases.filter((p) => isSpendingCategory(p.category));
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
    charges: round(charges),
    // Conta só as compras. O pagamento da fatura é um lançamento, mas a coluna
    // da tela se chama "Compras" — incluí-lo deixava o número sempre +1.
    frequency: spending.length,
    categoriesResult,
    ...percentageByCategory,
  };
}

/**
 * Uma fatura com menos compras que isso não marca a borda do ciclo: a última
 * compra dela pode ter caído dias antes do fechamento por acaso.
 */
const MIN_PURCHASES_FOR_BOUNDARY = 5;

/** Abaixo disso não há série para inferir fechamento nenhum. */
const MIN_BILLS_FOR_INFERENCE = 3;

/** Quantas faturas recentes a inferência olha — o fechamento muda com os anos. */
const INFERENCE_WINDOW = 24;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Em que dia do mês o ciclo do cartão fecha, lido das próprias compras.
 *
 * O emissor não conta esse dia em lugar nenhum do CSV, mas ele está nos dados: a
 * última compra de cada fatura cai na véspera do fechamento. Na base de
 * referência as 24 faturas recentes fecham no dia 26 (13×), 25 (9×) ou 23 (2×) —
 * mediana 26, e o erro da regra nunca é positivo, ou seja, nenhuma compra passa
 * do dia inferido. Daí a mediana, e não a média: um mês em que a última compra
 * caiu no dia 9 não move a borda.
 *
 * Devolve `null` quando não há histórico suficiente. Chutar um dia seria pior:
 * o número viria de outro cartão, não deste.
 */
export function inferClosingDay(
  purchases: AggregatablePurchase[],
  now = new Date(),
): number | null {
  const byMonth = new Map<string, { last: Date; count: number }>();
  for (const purchase of purchases) {
    const month = monthKey(purchase.referenceMonth);
    const current = byMonth.get(month);
    if (!current) {
      byMonth.set(month, { last: purchase.date, count: 1 });
      continue;
    }
    if (purchase.date > current.last) current.last = purchase.date;
    current.count++;
  }

  const closingDays = [...byMonth]
    .sort(([a], [b]) => a.localeCompare(b))
    // Fatura cuja última compra está no futuro não fechou — e parcela lançada
    // meses à frente tem data futura, então essas faturas existem desde já e
    // arrastariam a mediana para o começo do mês.
    .filter(([, { last, count }]) => count >= MIN_PURCHASES_FOR_BOUNDARY && last <= now)
    .slice(-INFERENCE_WINDOW)
    .map(([, { last }]) => last.getUTCDate());

  if (closingDays.length < MIN_BILLS_FOR_INFERENCE) return null;
  return Math.round(median(closingDays));
}

/**
 * Último dia de compra do ciclo da fatura `month`, em `YYYY-MM-DD`.
 *
 * O consumo da fatura vem do mês anterior ao do vencimento, então o ciclo fecha
 * no dia `closingDay` de `month - 1`. Sem dia inferido, cai no último dia do mês
 * anterior — o mês calendário, que é o que a Visão geral assumia antes de a
 * borda existir.
 */
export function billCycleEnd(month: string, closingDay: number | null): string {
  const [year, monthNumber] = month.split('-').map(Number);
  // Dia 0 do mês do vencimento é o último dia do mês anterior, com ano virado
  // de graça em janeiro.
  const lastDay = new Date(Date.UTC(year, monthNumber - 1, 0)).getUTCDate();
  const day = closingDay === null ? lastDay : Math.min(closingDay, lastDay);
  return new Date(Date.UTC(year, monthNumber - 2, day)).toISOString().slice(0, 10);
}

/** Uma fatura por mês de referência, em ordem cronológica. */
export function buildBills(purchases: AggregatablePurchase[], now = new Date()): Bill[] {
  const closingDay = inferClosingDay(purchases, now);

  return [...groupBy(purchases, (p) => monthKey(p.referenceMonth))]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthPurchases]) => ({
      ...buildBill(month, monthPurchases),
      cycleEnd: billCycleEnd(month, closingDay),
    }));
}
