import type { CategoryRule, PurchaseStore } from '@expense/categorization';
import { PAYMENT_CATEGORY } from '@expense/categorization';
import type { Bill, BillStore, Purchase } from '@expense/ingestion';
import { Collection, MongoClient, ObjectId } from 'mongodb';
import { config } from './config';

/** Uma regra como ela vive no banco. O `_id` não interessa à reaplicação. */
type StoredRule = CategoryRule & { userId: ObjectId };

/** Uma compra como ela vive no banco: a do pacote de ingestão, mais o dono. */
type StoredPurchase = Purchase & { userId: ObjectId };

export interface Connection {
  client: MongoClient;
  purchases: Collection<StoredPurchase>;
  rules: Collection<StoredRule>;
  runs: Collection<SyncRunDocument>;
  /**
   * O dono das faturas que entram por aqui — o `_id` de `OWNER_USERNAME` na
   * coleção `users`.
   *
   * Toda escrita deste arquivo o carrega. Uma compra sem `userId` não é um
   * documento levemente incompleto: ela não aparece para ninguém, porque toda
   * consulta da API filtra por dono.
   */
  ownerId: ObjectId;
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
  /** De quem foi a execução — o mesmo `ownerId` da conexão. */
  userId: ObjectId;
  /**
   * `manual` é o botão da tela; `cli` é o `pnpm extract` e o cron da VPS;
   * `upload` é o envio de CSVs por `POST /import`.
   */
  trigger: 'manual' | 'cli' | 'upload';
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

  const owner = await db
    .collection<{ username: string }>('users')
    .findOne({ username: config.ownerUsername });

  // Falhar alto, e não gravar assim mesmo: uma compra sem dono some da tela sem
  // erro nenhum, e o sintoma apareceria como "a extração rodou e não mudou nada".
  if (!owner) {
    await client.close();
    throw new Error(
      `Não achei o usuário "${config.ownerUsername}" na coleção users.\n` +
        'Rode a migração uma vez — `pnpm --filter @expense/api migrate:multiuser` — ' +
        'ou ajuste OWNER_USERNAME no .env.',
    );
  }

  return {
    client,
    purchases: db.collection<StoredPurchase>('purchases'),
    rules: db.collection<StoredRule>('categoryRules'),
    runs: db.collection<SyncRunDocument>('syncRuns'),
    ownerId: owner._id,
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
export async function writeBill(
  purchases: Collection<StoredPurchase>,
  bill: Bill,
  userId: ObjectId,
): Promise<void> {
  await purchases.deleteMany({ userId, referenceMonth: bill.referenceMonth });
  if (bill.data.length > 0) {
    await purchases.insertMany(bill.data.map((purchase) => ({ ...purchase, userId })));
  }
}

/** As regras do usuário, para a reaplicação depois da gravação. */
export async function loadRules(
  rules: Collection<StoredRule>,
  userId: ObjectId,
): Promise<CategoryRule[]> {
  return rules.find({ userId }, { projection: { _id: 0 } }).toArray();
}

/**
 * Dá `sourceCategory` às compras gravadas antes do campo existir, copiando a
 * categoria que elas já tinham. Sem isso a reaplicação não teria para onde
 * devolver uma compra quando a regra que a classificou fosse apagada.
 *
 * É `{ $exists: false }`, então roda uma vez de verdade e vira no-op depois.
 */
export async function backfillSourceCategory(
  purchases: Collection<StoredPurchase>,
  userId: ObjectId,
): Promise<number> {
  const result = await purchases.updateMany({ userId, sourceCategory: { $exists: false } }, [
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
export function createPurchaseStore(
  purchases: Collection<StoredPurchase>,
  userId: ObjectId,
): PurchaseStore {
  const mine = { userId, sourceCategory: { $ne: PAYMENT_CATEGORY } };

  return {
    async distinctTitles() {
      return purchases.distinct('title', mine);
    },
    async setCategoryForTitles(titles, category) {
      const result = await purchases.updateMany(
        { title: { $in: titles }, ...mine },
        { $set: { category } },
      );
      return result.modifiedCount;
    },
    async restoreSourceCategory(titles) {
      const result = await purchases.updateMany({ title: { $in: titles }, ...mine }, [
        { $set: { category: '$sourceCategory' } },
      ]);
      return result.modifiedCount;
    },
    async titlesWithSourceCategory(category) {
      return purchases.distinct('title', { userId, sourceCategory: category });
    },
  };
}

/** A ponta do `BillStore` que fala o driver cru — a API tem a sua, em Mongoose. */
export function createBillStore(connection: Connection): BillStore {
  const { ownerId } = connection;

  return {
    replaceMonth: (bill) => writeBill(connection.purchases, bill, ownerId),
    backfillSourceCategory: () => backfillSourceCategory(connection.purchases, ownerId),
    loadRules: () => loadRules(connection.rules, ownerId),
    purchases: createPurchaseStore(connection.purchases, ownerId),
  };
}
