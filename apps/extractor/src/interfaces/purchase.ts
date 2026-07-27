export interface Purchase {
  title: string;
  amount: number;
  date: Date;
  /**
   * A categoria que vale — a da ingestão, ou a que uma regra do usuário
   * sobrescreveu depois. É o campo que a API filtra e agrega.
   */
  category: string;
  /**
   * A categoria como a ingestão a resolveu, antes de qualquer regra do usuário.
   *
   * Existe para a aplicação de regras ser reversível: sem guardar o original ao
   * lado, apagar uma regra não teria para onde voltar, e a categoria que ela
   * carimbou ficaria grudada na compra para sempre. Reaplicar é sempre
   * `category = sourceCategory` e então as regras de agora.
   */
  sourceCategory: string;
  referenceMonth: Date;
}
