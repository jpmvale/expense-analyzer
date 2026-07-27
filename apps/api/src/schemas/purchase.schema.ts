import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PurchaseDocument = HydratedDocument<Purchase>;

@Schema({ collection: 'purchases' })
export class Purchase {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, index: true })
  date: Date;

  @Prop({ required: true, index: true })
  category: string;

  /** Primeiro dia (em UTC) do mês da fatura em que a compra apareceu. */
  @Prop({ required: true, index: true })
  referenceMonth: Date;
}

export const PurchaseSchema = SchemaFactory.createForClass(Purchase);
