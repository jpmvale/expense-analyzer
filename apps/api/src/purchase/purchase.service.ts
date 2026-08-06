import { FALLBACK_CATEGORY, NON_SPENDING_CATEGORIES } from '@expense/categorization';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Purchase, PurchaseDocument } from '../schemas/purchase.schema';
import { Subscription, SubscriptionDocument } from '../schemas/subscription.schema';
import { Bill, buildBills } from './bill-aggregation';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';
import { NameSubscriptionDto } from './dto/subscription.dto';
import { buildPurchaseFilter } from './purchase-filter';
import {
  buildPaging,
  buildSortSpec,
  buildSummaryPipeline,
  toSummary,
  type FacetShape,
} from './purchase-query';
import { buildPriceAlerts, PriceAlert } from './price-alerts';
import { buildRecurringCharges, RecurringCharge } from './recurring';
import { buildUncategorizedTitles, UncategorizedTitle } from './uncategorized';

export type { Bill, CategoryBreakdown } from './bill-aggregation';
export type { PriceAlert } from './price-alerts';
export type { PricePlateau, RecurringCharge } from './recurring';
export type { UncategorizedTitle } from './uncategorized';
export type { CategorySlice, MonthPoint, SortableField, SortOrder } from './purchase-query';

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

  /**
   * Uma página de compras, mais os agregados do filtro inteiro.
   *
   * A divisão é a coisa toda: `purchases` é a página, e `total`, `sum`,
   * `average`, `byMonth` e `byCategory` descrevem **todas** as linhas que o
   * filtro alcança. Antes a API mandava tudo e o cliente somava, ordenava e
   * fatiava; isso funcionava porque nada ficava de fora. Ao paginar, somar no
   * cliente passaria a descrever cinquenta linhas e chamar isso de "onde o
   * dinheiro foi" — errado, e sem nenhum sintoma visível.
   *
   * As duas consultas vão em paralelo porque não dependem uma da outra: a página
   * é um `find` com `skip`/`limit`, e os agregados são um `$facet` que varre o
   * filtro uma vez só para as três contas.
   */
  async listPurchases(userId: Types.ObjectId, filter: ListPurchasesQueryDto) {
    const query = buildPurchaseFilter(userId, filter);
    const { page, limit, skip } = buildPaging(filter.page, filter.limit);

    const [purchases, facet] = await Promise.all([
      this.purchaseModel
        .find(query)
        .sort(buildSortSpec(filter.sort, filter.order))
        .skip(skip)
        .limit(limit)
        .exec(),
      this.purchaseModel.aggregate<FacetShape>(buildSummaryPipeline(query)).exec(),
    ]);

    const summary = toSummary(facet[0]);

    return {
      purchases,
      ...summary,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(summary.total / limit)),
    };
  }

  /**
   * As faturas, agregadas mês a mês.
   *
   * Puxa a coleção inteira porque a agregação precisa dela: o dia em que o ciclo
   * fecha é inferido da distância entre a compra e a fatura em que ela caiu, e
   * isso só se vê olhando todas as compras. Os pagamentos entram junto — eles não
   * são gasto, mas são o `valuePaid` de cada mês.
   *
   * A projeção é o que impede isso de custar caro: `buildBills` lê quatro campos,
   * e sem dizê-lo o driver traz também `title`, `sourceCategory`, `_id` e `__v`.
   * Sobre 58 mil documentos a diferença medida foi de 123 ms para 79 ms; sobre a
   * base de referência não se sente, mas é o mesmo cuidado que `/purchase/recurring`
   * e `/purchase/uncategorized` já tomavam.
   */
  async listBills(userId: Types.ObjectId): Promise<Bill[]> {
    const purchases = await this.purchaseModel
      .find({ userId })
      .select('amount category referenceMonth date')
      .sort('date')
      .exec();

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
  async listUncategorized(userId: Types.ObjectId): Promise<UncategorizedTitle[]> {
    const purchases = await this.purchaseModel
      .find({ userId, category: FALLBACK_CATEGORY })
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
  async listRecurring(userId: Types.ObjectId): Promise<NamedRecurringCharge[]> {
    const [purchases, names] = await Promise.all([
      this.purchaseModel
        .find({ userId, category: { $nin: NON_SPENDING_CATEGORIES } })
        .select('title amount date')
        .exec(),
      this.subscriptionModel.find({ userId }).select('key name').exec(),
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
   * Os reajustes dos últimos ciclos fechados — o mesmo aviso do cartão "Mudou de
   * preço" da Visão geral, como rota própria para quem quer perguntar sem abrir
   * a tela: um cron pessoal, um atalho de celular.
   */
  async listPriceAlerts(userId: Types.ObjectId): Promise<PriceAlert[]> {
    const [bills, recurring] = await Promise.all([
      this.listBills(userId),
      this.listRecurring(userId),
    ]);

    // Mesmo recorte da Visão geral: só o que já fechou é notícia estável — a
    // fatura em aberto ainda pode ganhar compra e mudar o degrau.
    const today = new Date().toISOString().slice(0, 10);
    const closed = bills.filter((bill) => bill.cycleEnd < today);

    return buildPriceAlerts(recurring, closed);
  }

  /**
   * Batiza uma assinatura. Rebatizar sobrescreve, em vez de empilhar um segundo
   * nome para a mesma chave.
   *
   * Não valida se a chave existe hoje: a detecção depende de haver seis meses de
   * série, e uma assinatura pode sair da lista por um tempo — invalidar o nome
   * nesse intervalo perderia o apelido justamente de quem cancelou e voltou.
   */
  async nameSubscription(
    userId: Types.ObjectId,
    dto: NameSubscriptionDto,
  ): Promise<SubscriptionDocument> {
    const key = dto.key.trim();
    const name = dto.name.trim();

    const saved = await this.subscriptionModel
      .findOneAndUpdate({ userId, key }, { $set: { name } }, { new: true, upsert: true })
      .exec();

    return saved;
  }

  /** Devolve a assinatura ao título que vem no cartão. */
  async clearSubscriptionName(userId: Types.ObjectId, key: string): Promise<void> {
    const result = await this.subscriptionModel.findOneAndDelete({ userId, key }).exec();
    if (!result) throw new NotFoundException('Essa assinatura não tem nome formal.');
  }
}
