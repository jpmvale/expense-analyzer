/**
 * Dá endereço de e-mail a uma conta que nasceu sem ele.
 *
 * O e-mail virou obrigatório no cadastro, mas as contas anteriores a isso não
 * têm nenhum — e o endereço delas não está em lugar nenhum do sistema para ser
 * adivinhado. Sem este comando, a única forma de tornar uma conta antiga
 * recuperável seria editar o documento na mão.
 *
 *   pnpm --filter @expense/api set-email <usuario> <email>
 */
import { resolve } from 'node:path';
import mongoose from 'mongoose';

const repoRoot = resolve(__dirname, '../../../..');
try {
  process.loadEnvFile(resolve(repoRoot, '.env'));
} catch {
  // Sem arquivo: vale o que já estiver no ambiente (é assim no container).
}

// O pnpm 10 repassa o próprio `--` como argumento — a mesma armadilha que já
// tinha feito o `hash-password` hashear a string "--" em silêncio.
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const [username, email] = args;

if (!username || !email) {
  console.error('Uso: pnpm --filter @expense/api set-email <usuario> <email>');
  process.exit(1);
}

async function main(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI não definida.');

  const connection = await mongoose.createConnection(uri).asPromise();
  const db = connection.db;
  if (!db) throw new Error('Conexão aberta sem banco — confira o nome do banco na MONGO_URI.');

  try {
    const users = db.collection('users');
    const alvo = username.trim().toLowerCase();
    const endereco = email.trim().toLowerCase();

    // O índice de e-mail é único: sem esta checagem o erro seria um 11000 cru,
    // que não diz de quem é o endereço que já está lá.
    const ocupado = await users.findOne({ email: endereco, username: { $ne: alvo } });
    if (ocupado) {
      throw new Error(`O e-mail ${endereco} já é da conta "${String(ocupado.username)}".`);
    }

    const result = await users.updateOne({ username: alvo }, { $set: { email: endereco } });
    if (result.matchedCount === 0) throw new Error(`Não achei a conta "${alvo}".`);

    console.log(`${alvo}: e-mail definido como ${endereco}`);
  } finally {
    await connection.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
