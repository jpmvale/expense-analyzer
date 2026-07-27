import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Purchase, PurchaseDocument } from '../schemas/purchase.schema';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';
import { buildPurchaseFilter, PAYMENT_CATEGORY } from './purchase-filter';

export interface CategoryBreakdown {
  categoryByMonth: string;
  totalCategory: number;
  frequency: number;
  percentage: number;
}

/**
 * Além dos campos fixos, cada fatura carrega uma chave por categoria com o
 * percentual do mês (`supermercado: 12.5`) — é assim que a tabela do front
 * monta as colunas de categoria sem precisar conhecer o breakdown completo.
 */
export type Bill = {
  month: string;
  valuePaid: number;
  total: number;
  frequency: number;
  categoriesResult: CategoryBreakdown[];
} & Record<string, unknown>;

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

    const byMonth = new Map<string, PurchaseDocument[]>();
    for (const purchase of purchases) {
      const key = monthKey(purchase.referenceMonth);
      const bucket = byMonth.get(key);
      if (bucket) {
        bucket.push(purchase);
      } else {
        byMonth.set(key, [purchase]);
      }
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, monthPurchases]) => this.buildBill(month, monthPurchases));
  }

  private buildBill(month: string, monthPurchases: PurchaseDocument[]): Bill {
    const payment = monthPurchases.find((p) => p.category === PAYMENT_CATEGORY);
    const spending = monthPurchases.filter((p) => p.category !== PAYMENT_CATEGORY);
    const total = spending.reduce((acc, purchase) => acc + purchase.amount, 0);

    const byCategory = new Map<string, PurchaseDocument[]>();
    for (const purchase of spending) {
      const bucket = byCategory.get(purchase.category);
      if (bucket) {
        bucket.push(purchase);
      } else {
        byCategory.set(purchase.category, [purchase]);
      }
    }

    const categoriesResult: CategoryBreakdown[] = [...byCategory.entries()].map(
      ([category, items]) => {
        const totalCategory = items.reduce((acc, purchase) => acc + purchase.amount, 0);
        return {
          categoryByMonth: category,
          totalCategory: round(totalCategory),
          frequency: items.length,
          // Sem gastos no mês a divisão seria 0/0 (NaN) e quebraria o JSON.
          percentage: total > 0 ? round((totalCategory * 100) / total) : 0,
        };
      },
    );

    const percentageByCategory = Object.fromEntries(
      categoriesResult.map((c) => [c.categoryByMonth, c.percentage]),
    );

    return {
      month,
      valuePaid: round(payment?.amount ?? 0),
      total: round(total),
      frequency: monthPurchases.length,
      categoriesResult,
      ...percentageByCategory,
    };
  }
}

/** `YYYY-MM`, com o mês sempre em dois dígitos para ordenar como texto. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
