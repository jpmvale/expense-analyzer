import { PROTECTED_CATEGORIES, type PurchaseStore } from '@expense/categorization';
import { Model } from 'mongoose';
import { PurchaseDocument } from '../schemas/purchase.schema';

/**
 * A ponta do `PurchaseStore` que fala Mongoose. O extractor tem a sua, no driver
 * cru; as duas obedecem ao mesmo contrato para que a decisão de qual título vai
 * para qual categoria exista num lugar só, no pacote de categorização.
 *
 * O guard olha `sourceCategory`, e não `category`, por dois motivos: `category`
 * já pode ter sido sobrescrita numa passada anterior, e é `sourceCategory` que
 * guarda o que a fatura de fato disse. Isso é o que mantém estorno, imposto,
 * parcelamento e pagamento fora do alcance de qualquer regra — uma regra é sobre
 * onde se gastou, e transformar um estorno em gasto desmontaria a conta que
 * hoje fecha entre `/purchase` e `/purchase/bill`.
 */
export function createPurchaseStore(purchaseModel: Model<PurchaseDocument>): PurchaseStore {
  const unprotected = { sourceCategory: { $nin: PROTECTED_CATEGORIES as string[] } };

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
