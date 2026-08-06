import { Bill } from './interfaces/bill';
import { IngestionLogger } from './logger';
import {
  CategoryMemory,
  parseBillCsv,
  referenceMonthFromFileName,
  referenceMonthFromRows,
} from './parseBillCsv';
import { warnDiscarded } from './sources/warnDiscarded';

/** Um CSV já em memória, venha ele do disco ou de um upload. */
export interface CsvFile {
  name: string;
  content: string;
}

/** O que aconteceu com cada arquivo — o relato que o upload devolve à tela. */
export interface CsvFileOutcome {
  name: string;
  /** `AAAA-MM` da fatura, ou `null` quando o arquivo foi recusado. */
  month: string | null;
  /** De onde saiu o mês. `null` acompanha o arquivo recusado. */
  monthFrom: 'filename' | 'content' | null;
  purchases: number;
  /** Linhas sem título, data ou valor legível. */
  discarded: number;
  /** Por que o arquivo ficou de fora, quando ficou. */
  skipped?: string;
}

export interface CsvFilesResult {
  bills: Bill[];
  files: CsvFileOutcome[];
}

/**
 * Converte CSVs em faturas — o miolo que o disco e o upload têm em comum.
 *
 * Existe como função própria porque as duas pontas precisam da **mesma** ordem
 * de operações, e ela não é óbvia: as faturas são processadas em ordem
 * cronológica pelo mês detectado, e não pela ordem em que chegaram, porque a
 * `CategoryMemory` é compartilhada entre elas e só propaga para a frente. Ler as
 * faturas antigas por último a deixaria vazia justamente onde ela é necessária.
 *
 * `inferMonthFromContent` separa quem pode adivinhar de quem não pode:
 *
 * - **não** (disco e Drive): um arquivo sem `AAAA-MM` no nome é ignorado com
 *   aviso. A pasta e o filtro do Drive podem trazer qualquer CSV, e adivinhar o
 *   mês de um arquivo que não é fatura gravaria lixo por cima de um mês bom;
 * - **sim** (upload): quem escolheu o arquivo na tela está dizendo que aquilo é
 *   uma fatura, e obrigá-lo a renomear o que baixou do banco seria transformar o
 *   padrão de nome interno do extractor em tarefa do usuário.
 */
export function billsFromCsvFiles(
  files: CsvFile[],
  logger: IngestionLogger,
  { inferMonthFromContent = false }: { inferMonthFromContent?: boolean } = {},
): CsvFilesResult {
  const outcomes: CsvFileOutcome[] = [];

  interface Resolved {
    file: CsvFile;
    referenceMonth: Date;
    monthFrom: 'filename' | 'content';
  }

  const resolved = files.flatMap<Resolved>((file) => {
    const fromName = referenceMonthFromFileName(file.name);
    if (fromName) return [{ file, referenceMonth: fromName, monthFrom: 'filename' as const }];

    const fromContent = inferMonthFromContent ? referenceMonthFromRows(file.content) : null;
    if (fromContent) return [{ file, referenceMonth: fromContent, monthFrom: 'content' as const }];

    const motivo = inferMonthFromContent
      ? 'o nome não contém <ano>-<mês> e as datas de dentro do arquivo não foram lidas.'
      : 'o nome não contém o padrão <ano>-<mês>.';
    logger.warn(`Ignorando "${file.name}": ${motivo}`);
    outcomes.push({
      name: file.name,
      month: null,
      monthFrom: null,
      purchases: 0,
      discarded: 0,
      skipped: motivo,
    });
    return [];
  });

  resolved.sort((a, b) => +a.referenceMonth - +b.referenceMonth);

  const memory = new CategoryMemory();
  const bills: Bill[] = [];

  for (const { file, referenceMonth, monthFrom } of resolved) {
    const { purchases, discarded } = parseBillCsv(file.content, referenceMonth, memory);
    warnDiscarded(file.name, discarded, logger);

    outcomes.push({
      name: file.name,
      month: referenceMonth.toISOString().slice(0, 7),
      monthFrom,
      purchases: purchases.length,
      discarded,
    });
    bills.push({ referenceMonth, data: purchases });
  }

  return { bills, files: outcomes };
}
