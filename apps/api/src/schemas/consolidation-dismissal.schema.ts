import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type ConsolidationDismissalDocument = HydratedDocument<ConsolidationDismissal>;

/**
 * Uma sugestão de consolidação que o usuário decidiu não ver de novo.
 *
 * A sugestão em si não é um documento — ela é recalculada a cada requisição a
 * partir das regras e das compras, igual à detecção de assinatura. Esta coleção
 * guarda só a decisão de escondê-la, pelo par que a identifica.
 *
 * `type` explícito nos dois campos: o `emitDecoratorMetadata` só existe sob o
 * compilador do TypeScript, e os testes rodam sob esbuild, que não o emite.
 */
@Schema({
  collection: 'consolidationDismissals',
  timestamps: { createdAt: true, updatedAt: false },
})
export class ConsolidationDismissal {
  /** De quem é este descarte — o `_id` na coleção `users`. */
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true })
  category: string;

  /** O trecho normalizado, exatamente como `GET /category-rule/consolidation` devolve. */
  @Prop({ type: String, required: true })
  value: string;
}

export const ConsolidationDismissalSchema = SchemaFactory.createForClass(ConsolidationDismissal);

ConsolidationDismissalSchema.index({ userId: 1, category: 1, value: 1 }, { unique: true });
