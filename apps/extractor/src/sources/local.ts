import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config';
import { Bill } from '../interfaces/bill';
import { CategoryMemory, parseBillCsv, referenceMonthFromFileName } from '../parseBillCsv';
import { warnDiscarded } from './warnDiscarded';

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

  // Processa em ordem cronológica pelo mês detectado, não pela ordem do nome do
  // arquivo: a memória de categorização só propaga para a frente, e ler as
  // faturas antigas por último a deixaria vazia justo onde ela é necessária.
  const ordenados = fileNames
    .flatMap((fileName) => {
      const referenceMonth = referenceMonthFromFileName(fileName);
      if (!referenceMonth) {
        console.warn(`Ignorando "${fileName}": o nome não contém o padrão <ano>-<mês>.`);
        return [];
      }
      return [{ fileName, referenceMonth }];
    })
    .sort((a, b) => +a.referenceMonth - +b.referenceMonth);

  const memory = new CategoryMemory();
  const bills: Bill[] = [];

  for (const { fileName, referenceMonth } of ordenados) {
    const csv = await readFile(join(config.billsDir, fileName), 'utf-8');
    const { purchases, discarded } = parseBillCsv(csv, referenceMonth, memory);
    warnDiscarded(fileName, discarded);
    bills.push({ referenceMonth, data: purchases });
  }

  return bills;
}
