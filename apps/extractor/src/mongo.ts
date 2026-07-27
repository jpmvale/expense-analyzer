import type { CategoryRule, PurchaseStore } from '@expense/categorization';
import { PAYMENT_CATEGORY } from '@expense/categorization';
import { Collection, MongoClient } from 'mongodb';
import { config } from './config';
import { Bill } from './interfaces/bill';
import { Purchase } from './interfaces/purchase';

/** Uma regra como ela vive no banco. O `_id` não interessa à reaplicação. */
type StoredRule = CategoryRule;

export interface Connection {
  client: MongoClient;
  purchases: Collection<Purchase>;
  rules: Collection<StoredRule>;
}

/**
 * Abre a conexão com o Mongo. O nome do banco vem da própria URI
 * (`.../credit-card`), que é o mesmo banco que a API lê.
 */
export async function connect(): Promise<Connection> {
  const client = new MongoClient(config.mongoUri);
  await client.connect();
  const db = client.db();
  return {
    client,
    purchases: db.collection<Purchase>('purchases'),
    rules: db.collection<StoredRule>('categoryRules'),
  };
}

/**
 * Grava uma fatura. Apaga antes as compras daquele mês de referência: rodar o
 * extractor de novo é idempotente, e faturas corrigidas sobrescrevem as antigas.
 *
 * Nada do que o usuário classificou se perde nesse apagão, porque a classificação
 * dele não mora aqui: mora em `categoryRules`, fora do mês, e é reaplicada logo
 * depois pelo `reapplyRules`.
 */
export async function writeBill(purchases: Collection<Purchase>, bill: Bill): Promise<void> {
  await purchases.deleteMany({ referenceMonth: bill.referenceMonth });
  if (bill.data.length > 0) await purchases.insertMany(bill.data);

  const month = bill.referenceMonth.toISOString().slice(0, 7);
  console.log(`  ${month}: ${bill.data.length} compras`);
}

/** As regras do usuário, para a reaplicação depois da gravação. */
export async function loadRules(rules: Collection<StoredRule>): Promise<CategoryRule[]> {
  return rules.find({}, { projection: { _id: 0 } }).toArray();
}

/**
 * Dá `sourceCategory` às compras gravadas antes do campo existir, copiando a
 * categoria que elas já tinham. Sem isso a reaplicação não teria para onde
 * devolver uma compra quando a regra que a classificou fosse apagada.
 *
 * É `{ $exists: false }`, então roda uma vez de verdade e vira no-op depois.
 */
export async function backfillSourceCategory(
  purchases: Collection<Purchase>,
): Promise<number> {
  const result = await purchases.updateMany({ sourceCategory: { $exists: false } }, [
    { $set: { sourceCategory: '$category' } },
  ]);
  return result.modifiedCount;
}

/**
 * A ponta do `PurchaseStore` que fala o driver cru do Mongo. A API tem a sua, em
 * Mongoose; as duas obedecem ao mesmo contrato, e a decisão de qual título vai
 * para qual categoria fica inteira no pacote de categorização.
 *
 * Fora do alcance das regras fica só o pagamento da fatura. O filtro é por
 * `sourceCategory` e não por `category` porque `category` já pode ter sido
 * reescrita numa passada anterior — `sourceCategory` não muda nunca.
 */
export function createPurchaseStore(purchases: Collection<Purchase>): PurchaseStore {
  const unprotected = { sourceCategory: { $ne: PAYMENT_CATEGORY } };

  return {
    async distinctTitles() {
      return purchases.distinct('title', unprotected);
    },
    async setCategoryForTitles(titles, category) {
      const result = await purchases.updateMany(
        { title: { $in: titles }, ...unprotected },
        { $set: { category } },
      );
      return result.modifiedCount;
    },
    async restoreSourceCategory(titles) {
      const result = await purchases.updateMany({ title: { $in: titles }, ...unprotected }, [
        { $set: { category: '$sourceCategory' } },
      ]);
      return result.modifiedCount;
    },
  };
}
