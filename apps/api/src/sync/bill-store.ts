import type { CategoryRule } from '@expense/categorization';
import type { BillStore } from '@expense/ingestion';
import { Model } from 'mongoose';
import { createPurchaseStore } from '../category/purchase-store';
import { CategoryRuleDocument } from '../schemas/category-rule.schema';
import { PurchaseDocument } from '../schemas/purchase.schema';

/**
 * A ponta do `BillStore` que fala Mongoose. O extractor tem a sua, no driver
 * cru; as duas obedecem ao mesmo contrato para que a ordem das operações de uma
 * ingestão — apaga o mês, grava, backfill, reaplica — exista num lugar só.
 */
export function createBillStore(
  purchaseModel: Model<PurchaseDocument>,
  ruleModel: Model<CategoryRuleDocument>,
): BillStore {
  return {
    /**
     * Apaga o mês inteiro antes de gravar: reextrair é idempotente, e uma fatura
     * corrigida sobrescreve a antiga sem deixar resto. O que o usuário
     * classificou não mora aqui — mora em `categoryRules` — e volta na
     * reaplicação logo depois.
     */
    async replaceMonth(bill) {
      await purchaseModel.deleteMany({ referenceMonth: bill.referenceMonth }).exec();
      if (bill.data.length > 0) await purchaseModel.insertMany(bill.data);
    },

    async backfillSourceCategory() {
      const result = await purchaseModel
        .updateMany({ sourceCategory: { $exists: false } }, [
          { $set: { sourceCategory: '$category' } },
        ])
        .exec();
      return result.modifiedCount;
    },

    async loadRules() {
      return ruleModel.find().lean<CategoryRule[]>().exec();
    },

    purchases: createPurchaseStore(purchaseModel),
  };
}
