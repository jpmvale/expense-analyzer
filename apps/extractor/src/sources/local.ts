import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config';
import { Bill } from '../interfaces/bill';
import { CategoryMemory, parseBillCsv, referenceMonthFromFileName } from '../parseBillCsv';

/**
 * Lê as faturas de um diretório da máquina — útil pra quem baixa os CSVs
 * direto do app do Nubank e não quer configurar o Google Drive.
 */
export async function fetchBillsFromDisk(): Promise<Bill[]> {
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
    console.warn(`Nenhum .csv em ${config.billsDir}`);
    return [];
  }

  const memory = new CategoryMemory();
  const bills: Bill[] = [];

  for (const fileName of fileNames) {
    const referenceMonth = referenceMonthFromFileName(fileName);
    if (!referenceMonth) {
      console.warn(`Ignorando "${fileName}": o nome não contém o padrão <ano>-<mês>.`);
      continue;
    }

    const csv = await readFile(join(config.billsDir, fileName), 'utf-8');
    bills.push({ referenceMonth, data: parseBillCsv(csv, referenceMonth, memory) });
  }

  return bills.sort((a, b) => +a.referenceMonth - +b.referenceMonth);
}
