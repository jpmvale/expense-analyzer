/**
 * Lê as faturas da fonte configurada e grava no Mongo. `pnpm extract` na raiz.
 *
 * A leitura e a gravação em si moram em `@expense/ingestion`, e não aqui: a API
 * dispara exatamente a mesma ingestão quando alguém clica em "Sincronizar", e
 * duas cópias da mesma ordem de operações divergiriam. O que sobra neste arquivo
 * é o que só existe na linha de comando — ler o `.env`, abrir a conexão, relatar
 * no terminal e devolver um código de saída.
 */
import {
  consoleLogger,
  fetchBills,
  ingestBills,
  type IngestionLogger,
} from '@expense/ingestion';
import { config } from './config';
import { connect, createBillStore, type Connection } from './mongo';

/**
 * Escreve no terminal e guarda a mesma linha para o registro da execução.
 *
 * O terminal serve a quem está olhando agora; o registro serve à tela, que mostra
 * o relato da última sincronização — inclusive das que rodaram pelo cron, de
 * madrugada, quando ninguém estava vendo terminal nenhum.
 */
function teeLogger(lines: string[]): IngestionLogger {
  return {
    info: (message) => {
      consoleLogger.info(message);
      lines.push(message);
    },
    warn: (message) => {
      consoleLogger.warn(message);
      lines.push(`Atenção: ${message}`);
    },
  };
}

/**
 * Registra a execução na mesma coleção que a API usa, com `startedAt` como
 * chave da atualização.
 *
 * É o que faz uma extração pela linha de comando aparecer na tela como "última
 * sincronização" — sem isto, a tela mostraria o último clique no botão e
 * ignoraria tudo que rodou pelo cron.
 */
async function recordRun(
  connection: Connection,
  startedAt: Date,
  fields: Record<string, unknown>,
): Promise<void> {
  await connection.runs.updateOne(
    { trigger: 'cli', startedAt },
    { $set: { trigger: 'cli', startedAt, ...fields } },
    { upsert: true },
  );
}

async function main() {
  const lines: string[] = [];
  const logger = teeLogger(lines);

  const connection = await connect();
  const startedAt = new Date();

  try {
    await recordRun(connection, startedAt, { status: 'running' });

    try {
      const bills = await fetchBills(config.ingestion, logger);
      const result = await ingestBills(bills, createBillStore(connection), logger);
      await recordRun(connection, startedAt, {
        status: 'ok',
        finishedAt: new Date(),
        ...result,
        log: lines,
      });
    } catch (error) {
      // O registro do erro é gravado antes de relançar. Uma falha do Drive às
      // 07:00 pelo cron não deixa rastro nenhum onde alguém vá olhar — o log do
      // container morre com ele; a tela é onde a pergunta é feita.
      await recordRun(connection, startedAt, {
        status: 'error',
        finishedAt: new Date(),
        message: error instanceof Error ? error.message : String(error),
        log: lines,
      });
      throw error;
    }
  } finally {
    await connection.client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
