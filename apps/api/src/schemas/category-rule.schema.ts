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
  /** `exact` casa o título inteiro; `contains`, um trecho dele. */
  @Prop({ required: true, enum: ['exact', 'contains'] })
  kind: 'exact' | 'contains';

  @Prop({ required: true })
  value: string;

  @Prop({ required: true })
  category: string;

  /** Desempate entre regras igualmente específicas: a mais nova ganha. */
  updatedAt: Date;
}

export const CategoryRuleSchema = SchemaFactory.createForClass(CategoryRule);

CategoryRuleSchema.index({ kind: 1, value: 1 }, { unique: true });
