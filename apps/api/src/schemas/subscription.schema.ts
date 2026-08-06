import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type SubscriptionDocument = HydratedDocument<Subscription>;

/**
 * O nome que o usuário dá a uma assinatura.
 *
 * A assinatura em si não é um documento: ela é derivada das compras a cada
 * requisição, pela detecção de recorrência. Esta coleção guarda só o apelido —
 * `Mp *Melimais` é o que o emissor manda, `Meli+` é o que a coisa se chama.
 *
 * A chave é a mesma do agrupamento da detecção (`RecurringCharge.key`): o título
 * normalizado e sem o prefixo do gateway. Prender o nome ao título cru não
 * funcionaria, porque o mesmo serviço troca de gateway ao longo dos anos e cada
 * troca criaria um nome novo para a mesma assinatura.
 *
 * Nada aqui altera classificação, total nem categoria — é rótulo de tela. Um
 * nome cuja chave deixou de existir (porque a série ficou curta demais, ou porque
 * o agrupamento mudou) simplesmente não aparece, e a tela volta ao título cru.
 */
@Schema({ collection: 'subscriptions', timestamps: true })
export class Subscription {
  /** De quem é este apelido — o `_id` na coleção `users`. */
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId: Types.ObjectId;

  // `type` explícito em vez de inferido: o `emitDecoratorMetadata` só existe sob
  // o compilador do TypeScript, e os testes rodam sob esbuild, que não o emite.
  // Dizer o tipo produz o mesmo schema e o torna independente do flag.
  @Prop({ type: String, required: true })
  key: string;

  @Prop({ type: String, required: true })
  name: string;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

// Único por usuário, e não globalmente: o `unique: true` que ficava no `@Prop`
// de `key` faria o apelido que um usuário deu ao Spotify impedir o de outro.
SubscriptionSchema.index({ userId: 1, key: 1 }, { unique: true });
