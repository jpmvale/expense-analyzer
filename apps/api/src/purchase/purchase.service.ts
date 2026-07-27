import { FALLBACK_CATEGORY, NON_SPENDING_CATEGORIES } from '@expense/categorization';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Purchase, PurchaseDocument } from '../schemas/purchase.schema';
import { Bill, buildBills, round } from './bill-aggregation';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';
import { buildPurchaseFilter } from './purchase-filter';
import { buildRecurringCharges, RecurringCharge } from './recurring';
import { buildUncategorizedTitles, UncategorizedTitle } from './uncategorized';

export type { Bill, CategoryBreakdown } from './bill-aggregation';
export type { PricePlateau, RecurringCharge } from './recurring';
export type { UncategorizedTitle } from './uncategorized';

@Injectable()
export class PurchaseService {
  constructor(
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
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
  async listRecurring(): Promise<RecurringCharge[]> {
    const purchases = await this.purchaseModel
      .find({ category: { $nin: NON_SPENDING_CATEGORIES } })
      .select('title amount date')
      .exec();

    return buildRecurringCharges(purchases);
  }
}
