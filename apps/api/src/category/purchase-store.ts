import { PAYMENT_CATEGORY, type PurchaseStore } from '@expense/categorization';
import { Model } from 'mongoose';
import { PurchaseDocument } from '../schemas/purchase.schema';

/**
 * A ponta do `PurchaseStore` que fala Mongoose. O extractor tem a sua, no driver
 * cru; as duas obedecem ao mesmo contrato para que a decisão de qual título vai
 * para qual categoria exista num lugar só, no pacote de categorização.
 *
 * Fora do alcance das regras fica só o pagamento da fatura: uma regra que o
 * arrastasse para uma categoria somaria a fatura inteira como se fosse consumo.
 *
 * O filtro olha `sourceCategory` e não `category` porque `category` já pode ter
 * sido reescrita numa passada anterior — `sourceCategory` é o que a fatura disse,
 * e não muda.
 */
export function createPurchaseStore(purchaseModel: Model<PurchaseDocument>): PurchaseStore {
  const unprotected = { sourceCategory: { $ne: PAYMENT_CATEGORY } };

  return {
    async distinctTitles() {
      return purchaseModel.distinct('title', unprotected).exec();
    },
    async setCategoryForTitles(titles, category) {
      const result = await purchaseModel
        .updateMany({ title: { $in: titles }, ...unprotected }, { $set: { category } })
        .exec();
      return result.modifiedCount;
    },
    async restoreSourceCategory(titles) {
      const result = await purchaseModel
        .updateMany({ title: { $in: titles }, ...unprotected }, [
          { $set: { category: '$sourceCategory' } },
        ])
        .exec();
      return result.modifiedCount;
    },
  };
}
