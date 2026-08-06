/**
 * Dá dono aos dados que nasceram sem dono.
 *
 * Até a versão multiusuário, nenhum documento tinha `userId`: havia um usuário
 * só, ele morava no `.env`, e a coleção inteira era dele por definição. Agora
 * toda consulta filtra por dono — e um documento sem `userId` não aparece para
 * ninguém. Sem esta migração, abrir a app depois do deploy mostraria uma base
 * vazia, com os oito anos de fatura intactos no banco e invisíveis.
 *
 * O que ela faz, em ordem:
 *
 *   1. cria (ou reaproveita) o usuário dono a partir de `AUTH_USERNAME` e
 *      `AUTH_PASSWORD_HASH` — o hash que já está no `.env` é reusado, então o
 *      login de quem já usava o app continua exatamente o mesmo;
 *   2. carimba `userId` em todo documento que ainda não tem;
 *   3. derruba os índices únicos globais da versão de um usuário só.
 *
 * É idempotente: rodar de novo não muda nada. E **não apaga documento nenhum** —
 * só acrescenta campo e mexe em índice.
 *
 *   pnpm --filter @expense/api migrate:multiuser
 */
import { resolve } from 'node:path';
import mongoose from 'mongoose';

// `__dirname` é `apps/api/src/migrations` sob tsx — a mesma profundidade que o
// resto da app assume para achar o `.env` único da raiz do monorepo.
const repoRoot = resolve(__dirname, '../../../..');
try {
  process.loadEnvFile(resolve(repoRoot, '.env'));
} catch {
  // Sem arquivo: vale o que já estiver no ambiente (é assim no container).
}

/** As coleções que ganham dono. `sessions` fica de fora: sessão não é dado do usuário. */
const COLLECTIONS = [
  'purchases',
  'categoryRules',
  'categories',
  'subscriptions',
  'consolidationDismissals',
  'syncRuns',
];

/**
 * Os índices únicos que valiam para a coleção inteira, e que na versão
 * multiusuário recusariam do segundo usuário o que o primeiro já tem — a
 * categoria "mercado", o apelido do Spotify, a regra "ifood → delivery".
 *
 * O Mongoose cria os novos índices compostos sozinho na subida, mas nunca
 * remove um índice que deixou de ser declarado: é preciso derrubá-los aqui.
 */
const LEGACY_INDEXES: Record<string, string[]> = {
  categories: ['name_1'],
  subscriptions: ['key_1'],
  categoryRules: ['kind_1_value_1'],
  consolidationDismissals: ['category_1_value_1'],
  // Os índices de campo único das compras não atrapalham (não são únicos), mas
  // viraram redundantes: cada consulta agora começa por `userId`, e um índice
  // que ninguém usa só custa escrita.
  purchases: ['title_1', 'date_1', 'category_1', 'sourceCategory_1', 'referenceMonth_1'],
  syncRuns: ['startedAt_1'],
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} não definida. A migração a lê do .env da raiz para criar o usuário dono ` +
        'com o mesmo login que a app já usava.',
    );
  }
  return value;
}

async function main(): Promise<void> {
  const connection = await mongoose.createConnection(required('MONGO_URI')).asPromise();
  const db = connection.db;
  if (!db) throw new Error('Conexão aberta sem banco — confira o nome do banco na MONGO_URI.');

  try {
    const username = (process.env.OWNER_USERNAME ?? required('AUTH_USERNAME')).trim().toLowerCase();
    const passwordHash = required('AUTH_PASSWORD_HASH');

    // O índice único de `username` é criado aqui e não pelo Mongoose: a migração
    // roda antes da API subir, e é ela quem escreve o primeiro usuário.
    const users = db.collection('users');
    await users.createIndex({ username: 1 }, { unique: true });

    const existing = await users.findOne({ username });
    const owner = existing
      ? existing._id
      : (await users.insertOne({ username, passwordHash, createdAt: new Date() })).insertedId;

    console.log(
      existing
        ? `Usuário dono já existia: ${username} (${owner.toString()})`
        : `Usuário dono criado: ${username} (${owner.toString()})`,
    );

    for (const name of COLLECTIONS) {
      const result = await db
        .collection(name)
        .updateMany({ userId: { $exists: false } }, { $set: { userId: owner } });
      console.log(`  ${name}: ${result.modifiedCount} documentos carimbados`);
    }

    for (const [name, indexes] of Object.entries(LEGACY_INDEXES)) {
      const collection = db.collection(name);
      for (const index of indexes) {
        try {
          await collection.dropIndex(index);
          console.log(`  ${name}: índice antigo ${index} removido`);
        } catch {
          // 27 (IndexNotFound) é o caso normal numa segunda execução, ou num
          // banco que nunca teve o índice. Não há o que fazer nem o que dizer.
        }
      }
    }

    console.log('Pronto. Suba a API — o Mongoose cria os índices compostos na subida.');
  } finally {
    await connection.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
