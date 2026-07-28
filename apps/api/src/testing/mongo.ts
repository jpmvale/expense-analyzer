// Os decoradores de schema chamam a API de metadados; sem isto, importá-los
// direto num teste quebra antes de o servidor subir.
import 'reflect-metadata';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Connection, Model, Schema } from 'mongoose';
import { Category, CategoryDocument, CategorySchema } from '../schemas/category.schema';
import {
  CategoryRule,
  CategoryRuleDocument,
  CategoryRuleSchema,
} from '../schemas/category-rule.schema';
import { Purchase, PurchaseDocument, PurchaseSchema } from '../schemas/purchase.schema';
import {
  Subscription,
  SubscriptionDocument,
  SubscriptionSchema,
} from '../schemas/subscription.schema';

/**
 * Um MongoDB de verdade, em memória, para os testes que precisam do banco.
 *
 * A camada onde mora o risco do sistema é justamente a que fala Mongo: a
 * reaplicação de regras, o upsert e o rename/merge de categoria. Um mock do
 * Model mentiria nos pontos que mais importam — `restoreSourceCategory` grava
 * com pipeline de agregação (`{ $set: { category: '$sourceCategory' } }`), que
 * só o servidor sabe executar, e o rename depende de `updateMany` acertando três
 * coleções. Um duplo em memória diria que passou.
 *
 * Não sobe o Nest: os serviços recebem os `Model` pelo construtor e podem ser
 * instanciados direto. O que se quer testar é a decisão e a escrita, não a
 * injeção de dependência — essa o smoke test do CI já exercita.
 *
 * O binário do mongod é baixado uma vez (~77 MB) e fica em cache; a primeira
 * execução numa máquina limpa demora, as seguintes sobem em cerca de um segundo.
 */
export interface TestDb {
  purchases: Model<PurchaseDocument>;
  categories: Model<CategoryDocument>;
  rules: Model<CategoryRuleDocument>;
  subscriptions: Model<SubscriptionDocument>;
  /** Esvazia as coleções entre um teste e outro, sem derrubar o servidor. */
  clear(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Registra o schema na conexão devolvendo o `Model` na forma que os serviços
 * pedem.
 *
 * A conversão existe porque os dois lados descrevem a mesma coisa em tipos
 * diferentes: o schema é sobre o documento cru (`Purchase`) e os serviços
 * recebem `Model<PurchaseDocument>`, que é o hidratado. Em produção quem faz essa
 * ponte é o `@InjectModel` do Nest, que não é tipado em tempo de execução; aqui
 * ela precisa ser dita uma vez, num lugar só, em vez de espalhada por cada teste.
 */
function modelFor<T>(connection: Connection, name: string, schema: Schema): Model<T> {
  return connection.model(name, schema) as unknown as Model<T>;
}

export async function startTestDb(): Promise<TestDb> {
  const server = await MongoMemoryServer.create();
  const connection: Connection = mongoose.createConnection(server.getUri());
  await connection.asPromise();

  const purchases = modelFor<PurchaseDocument>(connection, Purchase.name, PurchaseSchema);
  const categories = modelFor<CategoryDocument>(connection, Category.name, CategorySchema);
  const rules = modelFor<CategoryRuleDocument>(connection, CategoryRule.name, CategoryRuleSchema);
  const subscriptions = modelFor<SubscriptionDocument>(
    connection,
    Subscription.name,
    SubscriptionSchema,
  );

  // O índice único de (kind, value) é parte do contrato da coleção de regras, e
  // o Mongoose só o cria em segundo plano — sem esperar, o primeiro teste que
  // dependesse dele passaria por acidente.
  await Promise.all([purchases.init(), categories.init(), rules.init(), subscriptions.init()]);

  return {
    purchases,
    categories,
    rules,
    subscriptions,
    async clear() {
      await Promise.all([
        purchases.deleteMany({}),
        categories.deleteMany({}),
        rules.deleteMany({}),
        subscriptions.deleteMany({}),
      ]);
    },
    async stop() {
      await connection.destroy();
      await server.stop();
    },
  };
}

/** Uma compra já ingerida: `category` e `sourceCategory` começam iguais. */
export function purchase(
  title: string,
  category: string,
  overrides: Partial<Purchase> = {},
): Purchase {
  return {
    title,
    amount: 100,
    date: new Date('2026-03-10T00:00:00.000Z'),
    category,
    sourceCategory: category,
    referenceMonth: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  };
}
