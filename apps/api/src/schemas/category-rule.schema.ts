import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CategoryRuleDocument = HydratedDocument<CategoryRule>;

/**
 * A classificação que o usuário fez, guardada fora das compras.
 *
 * É o ponto inteiro desta coleção: o extractor apaga e regrava o mês de
 * referência a cada execução, então tudo que morasse no documento da compra
 * morreria no próximo `pnpm extract`. Aqui a regra sobrevive, e é reaplicada
 * depois da gravação.
 *
 * O par (`kind`, `value`) é único — reclassificar o mesmo título é editar a
 * regra que já existe, nunca empilhar uma segunda.
 */
@Schema({ collection: 'categoryRules', timestamps: true })
export class CategoryRule {
  /**
   * `exact` casa o título inteiro; `contains`, um trecho dele.
   *
   * `type` explícito em vez de inferido, aqui e abaixo: o `emitDecoratorMetadata`
   * só existe sob o compilador do TypeScript, e os testes rodam sob esbuild, que
   * não o emite. Dizer o tipo produz o mesmo schema sem depender do flag — e para
   * este campo a inferência nunca funcionou, porque uma união de literais não tem
   * tipo em tempo de execução.
   */
  @Prop({ type: String, required: true, enum: ['exact', 'contains'] })
  kind: 'exact' | 'contains';

  @Prop({ type: String, required: true })
  value: string;

  @Prop({ type: String, required: true })
  category: string;

  /** Desempate entre regras igualmente específicas: a mais nova ganha. */
  updatedAt: Date;
}

export const CategoryRuleSchema = SchemaFactory.createForClass(CategoryRule);

CategoryRuleSchema.index({ kind: 1, value: 1 }, { unique: true });
