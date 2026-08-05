import type { CategoryRule, PurchaseStore } from '@expense/categorization';
import { PAYMENT_CATEGORY } from '@expense/categorization';
import type { Bill, BillStore, Purchase } from '@expense/ingestion';
import { Collection, MongoClient } from 'mongodb';
import { config } from './config';

/** Uma regra como ela vive no banco. O `_id` não interessa à reaplicação. */
type StoredRule = CategoryRule;

export interface Connection {
  client: MongoClient;
  purchases: Collection<Purchase>;
  rules: Collection<StoredRule>;
  runs: Collection<SyncRunDocument>;
}

/**
 * Uma execução da ingestão, como a API a grava e a tela a lê.
 *
 * O extractor escreve na mesma coleção de propósito: quem roda por cron e quem
 * clica no botão fazem exatamente a mesma coisa com o banco, e a pergunta que a
 * tela responde — "quando isto foi atualizado pela última vez?" — não tem por que
 * saber qual dos dois foi. Sem isto, uma extração pelo cron deixaria a tela
 * mostrando a sincronização manual de três dias atrás como a mais recente.
 */
export interface SyncRunDocument {
  /** `manual` é o botão da tela; `cli` é o `pnpm extract` e o cron da VPS. */
  trigger: 'manual' | 'cli';
  status: 'running' | 'ok' | 'error';
  startedAt: Date;
  finishedAt?: Date;
  bills?: number;
  purchases?: number;
  classified?: number;
  restored?: number;
  financing?: number;
  message?: string;
  log?: string[];
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
    runs: db.collection<SyncRunDocument>('syncRuns'),
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
    async titlesWithSourceCategory(category) {
      return purchases.distinct('title', { sourceCategory: category });
    },
  };
}

/** A ponta do `BillStore` que fala o driver cru — a API tem a sua, em Mongoose. */
export function createBillStore(connection: Connection): BillStore {
  return {
    replaceMonth: (bill) => writeBill(connection.purchases, bill),
    backfillSourceCategory: () => backfillSourceCategory(connection.purchases),
    loadRules: () => loadRules(connection.rules),
    purchases: createPurchaseStore(connection.purchases),
  };
}
