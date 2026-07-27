/**
 * O extractor grava os pagamentos da fatura como compras de categoria `payment`.
 * Eles entram no cálculo do que foi pago no mês, mas nunca contam como gasto.
 */
export const PAYMENT_CATEGORY = 'payment';

/** Onde uma compra cai quando nem o emissor, nem o usuário, nem as regras sabem. */
export const FALLBACK_CATEGORY = 'outros';

/**
 * Juros, multa, saldo rolado e o IOF que o atraso gera — o custo de financiar,
 * que não é compra nenhuma.
 *
 * Sem isso, `Saldo em atraso` entrava como o maior lançamento sem categoria da
 * base (R$ 10.023 em três linhas) e inflava "quanto eu gastei" com dinheiro que
 * ninguém gastou: é saldo que rolou de um mês para o outro. `Crédito de atraso`,
 * negativo, é o outro lado da mesma operação, e some junto.
 *
 * O IOF de uma compra internacional é outra coisa — é imposto sobre um gasto que
 * de fato aconteceu — e continua em `impostos`.
 */
export const FINANCING_CATEGORY = 'encargos';

/**
 * As categorias que ficam de fora do total gasto.
 *
 * É a única distinção do domínio que altera **quanto** se gastou, e não apenas
 * como o gasto se reparte. Por isso mora aqui, num lugar só: a agregação das
 * faturas e o filtro do `/purchase` precisam concordar sobre ela, senão as duas
 * telas mostram totais diferentes para o mesmo mês.
 */
export const NON_SPENDING_CATEGORIES: readonly string[] = [PAYMENT_CATEGORY, FINANCING_CATEGORY];

export function isSpendingCategory(category: string): boolean {
  return !NON_SPENDING_CATEGORIES.includes(category);
}

/**
 * O único nome que uma regra do usuário não pode usar nem tocar.
 *
 * `payment` não é categoria, é o pagamento da fatura: uma regra que jogasse uma
 * compra ali a apagaria do gasto, e uma que tirasse um pagamento de lá somaria a
 * fatura inteira como se fosse consumo.
 *
 * Nada mais é reservado, e isso é uma correção. `estorno`, `impostos` e
 * `parcelado` já foram tratados como intocáveis sob o argumento de que "quebram
 * o total" — não quebram: os três entram na soma como qualquer categoria, e
 * renomear um lançamento entre eles muda a composição, não o total. O preço da
 * proteção exagerada era concreto: as compras de `parcelado` — que só diz que o
 * gasto foi parcelado, não onde foi feito — ficavam presas ali para sempre, e
 * não havia como mandar um "IOF de compra internacional" para `impostos`.
 */
export function isReservedCategory(category: string): boolean {
  return category === PAYMENT_CATEGORY;
}

/**
 * O Nubank mistura códigos internos de transação no campo `category`
 * (`reversal_brazil_settled`, `tax_foreign`, `bnpl_transaction_upfront_national`).
 * Eles não são tipos de gasto, e vazavam crus para a tela: cada variação virava
 * uma coluna própria na tabela de faturas e uma fatia na pizza.
 *
 * As famílias são traduzidas para um rótulo só do domínio. São prefixos, e não a
 * lista exata de códigos, porque o Nubank cria variações novas (`_settled`,
 * `_due`, `_national`, `_foreign`) sem aviso.
 */
const CATEGORY_ALIASES: Array<[RegExp, string]> = [
  [/^reversal_/, 'estorno'],
  [/^tax_/, 'impostos'],
  [/^bnpl_/, 'parcelado'],
];

/** Rótulo de domínio para um código interno, ou `null` se não for um deles. */
export function aliasForCategory(category: string): string | null {
  for (const [pattern, label] of CATEGORY_ALIASES) {
    if (pattern.test(category)) return label;
  }
  return null;
}
