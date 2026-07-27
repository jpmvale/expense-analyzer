import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

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
  @Prop({ required: true, unique: true })
  name: string;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
