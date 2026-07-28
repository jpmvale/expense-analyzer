import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

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
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true })
  name: string;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
