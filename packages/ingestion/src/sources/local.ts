import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { IngestionConfig } from '../config';
import { billsFromCsvFiles } from '../csvFiles';
import { Bill } from '../interfaces/bill';
import { IngestionLogger } from '../logger';

/**
 * Lê as faturas de um diretório da máquina — útil pra quem baixa os CSVs
 * direto do app do Nubank e não quer configurar o Google Drive.
 *
 * A conversão em si mora em `billsFromCsvFiles`, que o `POST /import` também
 * usa: a ordem cronológica de processamento e a memória de categorização
 * compartilhada entre as faturas são a mesma decisão nas duas pontas, e duas
 * cópias dela divergiriam.
 */
export async function fetchBillsFromDisk(
  config: IngestionConfig,
  logger: IngestionLogger,
): Promise<Bill[]> {
  let fileNames: string[];
  try {
    fileNames = (await readdir(config.billsDir)).filter((name) => name.endsWith('.csv')).sort();
  } catch {
    throw new Error(
      `Diretório de faturas não encontrado: ${config.billsDir}\n` +
        'Crie-o e coloque os CSVs lá, ou ajuste BILLS_DIR no .env.',
    );
  }

  if (fileNames.length === 0) {
    logger.warn(`Nenhum .csv em ${config.billsDir}`);
    return [];
  }

  const files = await Promise.all(
    fileNames.map(async (name) => ({
      name,
      content: await readFile(join(config.billsDir, name), 'utf-8'),
    })),
  );

  // Sem inferir o mês pelo conteúdo: a pasta pode ter qualquer CSV, e adivinhar
  // o mês de um arquivo que não é fatura gravaria lixo por cima de um mês bom.
  return billsFromCsvFiles(files, logger).bills;
}
