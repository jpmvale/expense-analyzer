import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type CategoryDocument = HydratedDocument<Category>;

/**
 * Uma categoria criada pelo usuário.
 *
 * A coleção não é a lista completa de categorias — as que vêm das faturas
 * existem só como string nas compras, e continuam válidas. Ela guarda as que o
 * usuário inventou, que precisam existir **antes** de qualquer compra usá-las:
 * sem isso não daria para criar "mercado livre" e classificar em seguida.
 * `GET /category` devolve a união das duas.
 */
@Schema({ collection: 'categories', timestamps: { createdAt: true, updatedAt: false } })
export class Category {
  /** De quem é esta categoria — o `_id` na coleção `users`. */
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId: Types.ObjectId;

  // `type` explícito em vez de inferido: o `emitDecoratorMetadata` só existe sob
  // o compilador do TypeScript, e os testes rodam sob esbuild, que não o emite.
  // Dizer o tipo aqui produz o mesmo schema e o torna independente do flag.
  @Prop({ type: String, required: true })
  name: string;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

// Único por usuário, e não globalmente: o `unique: true` que ficava no `@Prop`
// de `name` valia para a coleção inteira, e recusaria a categoria "mercado" do
// segundo usuário porque o primeiro já tinha uma.
CategorySchema.index({ userId: 1, name: 1 }, { unique: true });
