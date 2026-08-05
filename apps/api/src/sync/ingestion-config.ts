import { resolve } from 'node:path';
import type { IngestionConfig } from '@expense/ingestion';
import { ConfigService } from '@nestjs/config';

// As mesmas variáveis que o extractor lê, e resolvidas do mesmo jeito: caminho
// relativo conta a partir da raiz do repositório, não do cwd de quem subiu o
// processo. `__dirname` é `apps/api/src/sync` sob `nest start` e
// `apps/api/dist/sync` depois do build — mesma profundidade nos dois.
const repoRoot = resolve(__dirname, '../../../..');

/**
 * Monta a configuração da ingestão a partir do ambiente da API.
 *
 * Existe em vez de o pacote ler `process.env` sozinho porque a API e o extractor
 * carregam ambiente de formas diferentes — `ConfigService` aqui, `dotenv` lá — e
 * um módulo que lesse o `.env` na carga passaria por cima do `ConfigModule`, que
 * só resolve depois.
 */
export function ingestionConfigFrom(config: ConfigService): IngestionConfig {
  const fromRoot = (value: string) => resolve(repoRoot, value);

  return {
    source: (config.get<string>('EXTRACTOR_SOURCE') ?? 'drive') as 'drive' | 'local',
    billsDir: fromRoot(config.get<string>('BILLS_DIR') ?? './bills'),
    driveFileQuery: config.get<string>('DRIVE_FILE_QUERY') ?? "name contains 'nubank'",
    googleCredentialsPath: fromRoot(
      config.get<string>('GOOGLE_CREDENTIALS_PATH') ?? './apps/extractor/drive-credentials.json',
    ),
    googleTokenPath: fromRoot(
      config.get<string>('GOOGLE_TOKEN_PATH') ?? './apps/extractor/token.json',
    ),
    // Nunca. A API não tem navegador para abrir nem alguém sentado na frente
    // dela: o consentimento do Google é gerado uma vez pelo `pnpm extract`, e
    // aqui o `token.json` só é lido. Com `true`, a primeira sincronização sem
    // token pendurava a requisição até o timeout sem dizer por quê.
    allowInteractiveAuth: false,
  };
}
