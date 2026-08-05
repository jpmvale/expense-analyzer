import { resolve } from 'node:path';
import type { IngestionConfig } from '@expense/ingestion';
import { config as loadEnv } from 'dotenv';

// O .env é único e mora na raiz do monorepo. `__dirname` é `apps/extractor/src`
// rodando via tsx e `apps/extractor/dist` depois do build — mesma profundidade.
const repoRoot = resolve(__dirname, '../../..');
loadEnv({ path: [resolve(repoRoot, '.env'), resolve(__dirname, '../.env')], quiet: true });

/** Resolve caminhos do .env relativos à raiz do repositório, não ao cwd. */
function fromRoot(value: string): string {
  return resolve(repoRoot, value);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} não definida. Copie .env.example para .env na raiz do repositório.`);
  }
  return value;
}

const ingestion: IngestionConfig = {
  source: (process.env.EXTRACTOR_SOURCE ?? 'drive') as 'drive' | 'local',
  billsDir: fromRoot(process.env.BILLS_DIR ?? './bills'),
  driveFileQuery: process.env.DRIVE_FILE_QUERY ?? "name contains 'nubank'",
  googleCredentialsPath: fromRoot(
    process.env.GOOGLE_CREDENTIALS_PATH ?? './apps/extractor/drive-credentials.json',
  ),
  googleTokenPath: fromRoot(process.env.GOOGLE_TOKEN_PATH ?? './apps/extractor/token.json'),
  // Aqui pode: `pnpm extract` é um comando de terminal, com uma pessoa na frente
  // para autorizar no navegador. É desta execução que o `token.json` nasce — o
  // mesmo arquivo que a API depois só consegue ler, nunca criar.
  allowInteractiveAuth: true,
};

export const config = {
  repoRoot,
  mongoUri: required('MONGO_URI'),
  ingestion,
};
