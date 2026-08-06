import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type PurchaseDocument = HydratedDocument<Purchase>;

// `type` explícito em vez de inferido, em todos os campos: o
// `emitDecoratorMetadata` só existe sob o compilador do TypeScript, e os testes
// rodam sob esbuild, que não o emite. Dizer o tipo produz o mesmo schema e o
// torna independente do flag.
@Schema({ collection: 'purchases' })
export class Purchase {
  /**
   * De quem é esta compra — o `_id` na coleção `users`.
   *
   * Está em **primeiro** em todos os índices desta coleção, e não é detalhe de
   * arrumação: toda consulta da app filtra por dono, então um índice que
   * começasse por `category` só serviria depois de o Mongo já ter juntado as
   * compras de todo mundo naquela categoria. Com `userId` na frente, cada
   * consulta varre apenas a fatia de quem perguntou.
   */
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId: Types.ObjectId;

  /**
   * Indexado por causa da reaplicação de regras, e não da busca da tela.
   *
   * A distinção importa: a busca por título é `$regex` sem âncora e
   * case-insensitive, e nenhum índice comum a atende — o Mongo varre a coleção
   * com ou sem ele (medido: 13 ms nos dois casos sobre 58 mil documentos). Já a
   * reaplicação consulta por igualdade — `distinct('title')` e
   * `updateMany({ title: { $in: [...] } })` —, e aí o índice vale: o mesmo
   * `updateMany` caiu de 35 ms para 5 ms.
   */
  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: Date, required: true })
  date: Date;

  /**
   * A categoria que vale: a da ingestão, ou a que uma regra do usuário
   * sobrescreveu. É por ela que tudo filtra e agrega.
   */
  @Prop({ type: String, required: true })
  category: string;

  /**
   * A categoria como a ingestão a resolveu, antes de qualquer regra do usuário.
   *
   * É o que torna a aplicação de regras reversível: apagar uma regra devolve a
   * compra a este valor. Reaplicar é sempre `sourceCategory` mais as regras de
   * agora — nunca o que estava gravado em `category` antes.
   *
   * Opcional no schema por causa das compras gravadas antes do campo existir; o
   * backfill do extractor as preenche na primeira execução.
   */
  @Prop({ type: String })
  sourceCategory: string;

  /** Primeiro dia (em UTC) do mês da fatura em que a compra apareceu. */
  @Prop({ type: Date, required: true })
  referenceMonth: Date;
}

export const PurchaseSchema = SchemaFactory.createForClass(Purchase);

// Os mesmos campos que já eram indexados um a um, agora com o dono na frente —
// veja o comentário de `userId`. O índice só de `userId` cobre as consultas que
// não filtram por mais nada, como a varredura de assinaturas.
PurchaseSchema.index({ userId: 1 });
PurchaseSchema.index({ userId: 1, title: 1 });
PurchaseSchema.index({ userId: 1, date: 1 });
PurchaseSchema.index({ userId: 1, category: 1 });
PurchaseSchema.index({ userId: 1, sourceCategory: 1 });
PurchaseSchema.index({ userId: 1, referenceMonth: 1 });
