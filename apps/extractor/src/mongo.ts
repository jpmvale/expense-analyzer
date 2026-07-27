import { Collection, MongoClient } from 'mongodb';
import { config } from './config';
import { Bill } from './interfaces/bill';
import { Purchase } from './interfaces/purchase';

/**
 * Abre a conexão com o Mongo. O nome do banco vem da própria URI
 * (`.../credit-card`), que é o mesmo banco que a API lê.
 */
export async function connect(): Promise<{ client: MongoClient; purchases: Collection<Purchase> }> {
  const client = new MongoClient(config.mongoUri);
  await client.connect();
  return { client, purchases: client.db().collection<Purchase>('purchases') };
}

/**
 * Grava uma fatura. Apaga antes as compras daquele mês de referência: rodar o
 * extractor de novo é idempotente, e faturas corrigidas sobrescrevem as antigas.
 */
export async function writeBill(purchases: Collection<Purchase>, bill: Bill): Promise<void> {
  await purchases.deleteMany({ referenceMonth: bill.referenceMonth });
  if (bill.data.length > 0) await purchases.insertMany(bill.data);

  const month = bill.referenceMonth.toISOString().slice(0, 7);
  console.log(`  ${month}: ${bill.data.length} compras`);
}
