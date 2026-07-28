import { FALLBACK_CATEGORY, NON_SPENDING_CATEGORIES } from '@expense/categorization';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Purchase, PurchaseDocument } from '../schemas/purchase.schema';
import { Subscription, SubscriptionDocument } from '../schemas/subscription.schema';
import { Bill, buildBills, round } from './bill-aggregation';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';
import { NameSubscriptionDto } from './dto/subscription.dto';
import { buildPurchaseFilter } from './purchase-filter';
import { buildRecurringCharges, RecurringCharge } from './recurring';
import { buildUncategorizedTitles, UncategorizedTitle } from './uncategorized';

export type { Bill, CategoryBreakdown } from './bill-aggregation';
export type { PricePlateau, RecurringCharge } from './recurring';
export type { UncategorizedTitle } from './uncategorized';

/**
 * A assinatura como a tela recebe: a detecção mais o apelido do usuário.
 *
 * O nome fica fora de `RecurringCharge` de propósito. Aquele tipo é o resultado
 * de uma função pura sobre as compras, e é o que decide o que é assinatura e qual
 * é o degrau; um rótulo guardado no banco não tem nada a dizer sobre isso.
 */
export type NamedRecurringCharge = RecurringCharge & { name: string | null };

@Injectable()
export class PurchaseService {
  constructor(
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
  ) {}

  async listPurchases(filter: ListPurchasesQueryDto) {
    const purchases = await this.purchaseModel
      .find(buildPurchaseFilter(filter))
      .sort('date')
      .exec();
    const sum = purchases.reduce((acc, purchase) => acc + purchase.amount, 0);
    const total = purchases.length;

    return {
      purchases,
      total,
      sum: round(sum),
      average: total > 0 ? round(sum / total) : 0,
    };
  }

  async listBills(): Promise<Bill[]> {
    const purchases = await this.purchaseModel.find().sort('date').exec();
    return buildBills(purchases);
  }

  /**
   * O que ainda está em `outros`, agrupado por título.
   *
   * Agrupar é o que torna a faxina viável: são milhares de compras sem
   * categoria, mas poucas centenas de títulos distintos, e classificar um título
   * resolve todas as compras dele de uma vez. A ordem é por dinheiro parado —
   * classificar o título de maior soma é o que mais muda os gráficos, e é o
   * oposto de uma lista cronológica, onde o esforço se dilui em cafés de R$ 8.
   *
   * O agrupamento é pelo título normalizado, senão `MERCADOLIVRE*MERCADOL` e
   * `Mercadolivre*Mercadol` apareceriam como duas tarefas para o mesmo lugar. As
   * variações de caixa vêm junto em `titles`, porque uma regra `exact` só
   * alcança a forma exata e a tela precisa saber quantas criar.
   */
  async listUncategorized(): Promise<UncategorizedTitle[]> {
    const purchases = await this.purchaseModel
      .find({ category: FALLBACK_CATEGORY })
      .select('title amount date')
      .exec();

    return buildUncategorizedTitles(purchases);
  }

  /**
   * As cobranças recorrentes e o degrau de preço de cada uma.
   *
   * É a rota que justifica o sistema existir: o app do banco responde "quanto
   * gastei e com quê", mas só aqui há oito anos de série contínua para dizer
   * que a assinatura subiu 28% e ninguém percebeu.
   *
   * A varredura é sobre a base inteira de propósito, sem recorte de período: a
   * escada de preços do Spotify começa em 2019, e qualquer janela mais curta
   * acharia um patamar só e nenhum degrau.
   */
  async listRecurring(): Promise<NamedRecurringCharge[]> {
    const [purchases, names] = await Promise.all([
      this.purchaseModel
        .find({ category: { $nin: NON_SPENDING_CATEGORIES } })
        .select('title amount date')
        .exec(),
      this.subscriptionModel.find().select('key name').exec(),
    ]);

    const byKey = new Map(names.map((subscription) => [subscription.key, subscription.name]));

    // O nome é rótulo, então ele se junta aqui e não dentro da detecção: o que
    // decide o que é assinatura continua sendo função pura das compras, e um
    // apelido não pode mudar agrupamento, degrau nem ordem da lista.
    return buildRecurringCharges(purchases).map((charge) => ({
      ...charge,
      name: byKey.get(charge.key) ?? null,
    }));
  }

  /**
   * Batiza uma assinatura. Rebatizar sobrescreve, em vez de empilhar um segundo
   * nome para a mesma chave.
   *
   * Não valida se a chave existe hoje: a detecção depende de haver seis meses de
   * série, e uma assinatura pode sair da lista por um tempo — invalidar o nome
   * nesse intervalo perderia o apelido justamente de quem cancelou e voltou.
   */
  async nameSubscription(dto: NameSubscriptionDto): Promise<SubscriptionDocument> {
    const key = dto.key.trim();
    const name = dto.name.trim();

    const saved = await this.subscriptionModel
      .findOneAndUpdate({ key }, { $set: { name } }, { new: true, upsert: true })
      .exec();

    return saved;
  }

  /** Devolve a assinatura ao título que vem no cartão. */
  async clearSubscriptionName(key: string): Promise<void> {
    const result = await this.subscriptionModel.findOneAndDelete({ key }).exec();
    if (!result) throw new NotFoundException('Essa assinatura não tem nome formal.');
  }
}
