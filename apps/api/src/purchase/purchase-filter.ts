import { NON_SPENDING_CATEGORIES, PAYMENT_CATEGORY } from '@expense/categorization';
import type { FilterQuery } from 'mongoose';
import type { PurchaseDocument } from '../schemas/purchase.schema';

/** O formato que o controller entrega; casado estruturalmente com o DTO. */
export interface PurchaseFilterInput {
  category?: string;
  date?: string;
  month?: string;
  title?: string;
}

/**
 * Intervalo `[início, fim)` de um mês, em UTC.
 *
 * As compras são gravadas em UTC (`2025-03-01T00:00:00.000Z`). Montar os limites
 * com `new Date(ano, mês, dia)` — que é horário local — desloca o intervalo
 * inteiro: em UTC-3 o início vira `2025-03-01T03:00Z` e engole justamente as
 * compras do dia 1º. Por isso todo cálculo de data aqui passa por `Date.UTC`.
 *
 * O fim é exclusivo (primeiro instante do mês seguinte) em vez do último dia à
 * meia-noite: assim uma compra com hora, e não só a data, continua dentro do mês.
 */
export function monthRangeUtc(year: number, month: number): { $gte: Date; $lt: Date } {
  return {
    $gte: new Date(Date.UTC(year, month - 1, 1)),
    $lt: new Date(Date.UTC(year, month, 1)),
  };
}

/** Primeiro dia do mês em UTC — como o extractor grava `referenceMonth`. */
export function referenceMonthUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/** O título vem do usuário e vira regex — sem escapar, `(` derruba a query. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseYearMonth(value: string): [number, number] {
  const [year, month] = value.split('-').map(Number);
  return [year, month];
}

/**
 * Monta o filtro do Mongo a partir dos query params. É uma função pura, fora do
 * service, porque é aqui que moram as regras que valem a pena testar sem banco.
 */
export function buildPurchaseFilter(input: PurchaseFilterInput): FilterQuery<PurchaseDocument> {
  // Sem corte por valor: estornos vêm negativos e precisam aparecer aqui, senão
  // este endpoint e o /purchase/bill discordam do total do mês — um lista só o
  // que foi gasto, o outro soma o que foi gasto menos o que voltou.
  //
  // Encargos saem junto com o pagamento pelo mesmo motivo: os dois ficam fora do
  // total das faturas, e deixá-los entrar aqui faria as duas telas discordarem.
  const query: FilterQuery<PurchaseDocument> = {
    category: { $nin: NON_SPENDING_CATEGORIES },
  };

  if (input.category) {
    // Escolher categorias substitui o `$nin` acima. `payment` continua fora em
    // qualquer caso — este endpoint promete nunca listar pagamento —, mas
    // `encargos` passa a ser pedível: juros e multa são coisas que o usuário
    // quer poder olhar de perto, contanto que não entrem no total por acidente.
    query.category = {
      $in: input.category
        .split(',')
        .map((category) => category.trim())
        .filter((category) => category !== '' && category !== PAYMENT_CATEGORY),
    };
  }

  // `date` é a data da compra; `month`, o mês da fatura em que ela apareceu.
  // São coisas diferentes de propósito: uma compra de 28/02 cai na fatura de
  // março. Filtrar por fatura é o que a tela oferece, e é o `month`.
  if (input.date) {
    const [year, month] = parseYearMonth(input.date);
    query.date = monthRangeUtc(year, month);
  }

  if (input.month) {
    const [year, month] = parseYearMonth(input.month);
    query.referenceMonth = referenceMonthUtc(year, month);
  }

  if (input.title) {
    query.title = { $regex: escapeRegExp(input.title), $options: 'i' };
  }

  return query;
}
