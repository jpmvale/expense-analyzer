import { PAYMENT_CATEGORY, type PurchaseStore } from '@expense/categorization';
import { Model, Types } from 'mongoose';
import { PurchaseDocument } from '../schemas/purchase.schema';

/**
 * A ponta do `PurchaseStore` que fala Mongoose. O extractor tem a sua, no driver
 * cru; as duas obedecem ao mesmo contrato para que a decisão de qual título vai
 * para qual categoria exista num lugar só, no pacote de categorização.
 *
 * O store já nasce preso a um dono, e é assim que o multiusuário chega até a
 * reaplicação: `reapplyRules` continua sem saber que usuário existe — ele
 * reescreve "a base", e quem decide que base é essa é este `userId`. Sem o
 * recorte aqui, aplicar uma regra recategorizaria as compras de todo mundo.
 *
 * Fora do alcance das regras fica só o pagamento da fatura: uma regra que o
 * arrastasse para uma categoria somaria a fatura inteira como se fosse consumo.
 *
 * O filtro olha `sourceCategory` e não `category` porque `category` já pode ter
 * sido reescrita numa passada anterior — `sourceCategory` é o que a fatura disse,
 * e não muda.
 */
export function createPurchaseStore(
  purchaseModel: Model<PurchaseDocument>,
  userId: Types.ObjectId,
): PurchaseStore {
  const mine = { userId, sourceCategory: { $ne: PAYMENT_CATEGORY } };

  return {
    async distinctTitles() {
      return purchaseModel.distinct('title', mine).exec();
    },
    async setCategoryForTitles(titles, category) {
      const result = await purchaseModel
        .updateMany({ title: { $in: titles }, ...mine }, { $set: { category } })
        .exec();
      return result.modifiedCount;
    },
    async restoreSourceCategory(titles) {
      const result = await purchaseModel
        .updateMany({ title: { $in: titles }, ...mine }, [
          { $set: { category: '$sourceCategory' } },
        ])
        .exec();
      return result.modifiedCount;
    },
    async titlesWithSourceCategory(category) {
      return purchaseModel.distinct('title', { userId, sourceCategory: category }).exec();
    },
  };
}
