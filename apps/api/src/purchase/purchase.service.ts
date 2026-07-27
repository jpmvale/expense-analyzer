import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Purchase, PurchaseDocument } from '../schemas/purchase.schema';
import { Bill, buildBills, round } from './bill-aggregation';
import { ListPurchasesQueryDto } from './dto/list-purchases-query.dto';
import { buildPurchaseFilter } from './purchase-filter';

export type { Bill, CategoryBreakdown } from './bill-aggregation';

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
}
