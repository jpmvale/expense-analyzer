/**
 * O extractor grava os pagamentos da fatura como compras de categoria `payment`.
 * Eles entram no cálculo do que foi pago no mês, mas nunca contam como gasto.
 */
export const PAYMENT_CATEGORY = 'payment';

/** Onde uma compra cai quando nem o emissor, nem o usuário, nem as regras sabem. */
export const FALLBACK_CATEGORY = 'outros';

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

/**
 * Categorias que uma regra do usuário não pode sobrescrever.
 *
 * As duas famílias aqui descrevem o **tipo da transação**, não o estabelecimento:
 * `payment` é o pagamento da fatura, e os aliases marcam estorno, imposto e
 * parcelamento. Uma regra é sobre onde se gastou — "Mercadolivre*Mercadol é
 * mercado livre" — e aplicá-la a um estorno do Mercado Livre transformaria um
 * crédito em gasto, quebrando a conta que hoje fecha entre `/purchase` e
 * `/purchase/bill`. É a mesma razão pela qual códigos internos ficam de fora da
 * memória de categorização na ingestão.
 */
export const PROTECTED_CATEGORIES: readonly string[] = [
  PAYMENT_CATEGORY,
  ...new Set(CATEGORY_ALIASES.map(([, label]) => label)),
];

export function isProtectedCategory(category: string): boolean {
  return PROTECTED_CATEGORIES.includes(category);
}
