import { IngestionConfig } from './config';
import { Bill } from './interfaces/bill';
import { IngestionLogger } from './logger';
import { fetchBillsFromDrive } from './sources/drive';
import { fetchBillsFromDisk } from './sources/local';

/**
 * Grava-se uma fatura por mês de referência, apagando o mês antes. Dois arquivos
 * apontando para o mesmo mês — o Drive aceita nomes repetidos — fazem o segundo
 * sobrescrever o primeiro sem dizer nada. Avisar é melhor que perder em silêncio.
 */
export function warnDuplicateMonths(bills: Bill[], logger: IngestionLogger): void {
  const seen = new Map<string, number>();
  for (const bill of bills) {
    const month = bill.referenceMonth.toISOString().slice(0, 7);
    seen.set(month, (seen.get(month) ?? 0) + 1);
  }

  for (const [month, count] of seen) {
    if (count > 1) {
      logger.warn(
        `${count} arquivos apontam para a fatura de ${month}. ` +
          'Só o último será gravado — confira se são duplicatas do mesmo arquivo.',
      );
    }
  }
}

/** Lê as faturas da fonte configurada, já em ordem cronológica. */
export async function fetchBills(
  config: IngestionConfig,
  logger: IngestionLogger,
): Promise<Bill[]> {
  if (config.source !== 'drive' && config.source !== 'local') {
    throw new Error(`EXTRACTOR_SOURCE inválido: "${config.source}". Use "drive" ou "local".`);
  }

  logger.info(
    config.source === 'drive'
      ? 'Buscando as faturas no Google Drive...'
      : `Lendo as faturas de ${config.billsDir}...`,
  );

  const bills =
    config.source === 'drive'
      ? await fetchBillsFromDrive(config, logger)
      : await fetchBillsFromDisk(config, logger);

  warnDuplicateMonths(bills, logger);
  return bills;
}
