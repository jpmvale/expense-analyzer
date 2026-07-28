import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

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
@Schema({ collection: 'consolidationDismissals', timestamps: { createdAt: true, updatedAt: false } })
export class ConsolidationDismissal {
  @Prop({ type: String, required: true })
  category: string;

  /** O trecho normalizado, exatamente como `GET /category-rule/consolidation` devolve. */
  @Prop({ type: String, required: true })
  value: string;
}

export const ConsolidationDismissalSchema = SchemaFactory.createForClass(ConsolidationDismissal);

ConsolidationDismissalSchema.index({ category: 1, value: 1 }, { unique: true });
