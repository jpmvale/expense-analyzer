/** O que aconteceu com cada arquivo enviado a `POST /import`. */
export interface ImportedFile {
  name: string;
  /** `AAAA-MM` da fatura, ou `null` quando o arquivo ficou de fora. */
  month: string | null;
  /**
   * De onde saiu o mês: do nome do arquivo (`nubank-2026-03.csv`) ou das datas
   * de dentro dele, quando o nome não trazia o padrão.
   */
  monthFrom: 'filename' | 'content' | null;
  purchases: number;
  /** Linhas sem título, data ou valor legível. */
  discarded: number;
  /** Por que o arquivo ficou de fora, quando ficou. */
  skipped?: string;
}

export interface ImportResult {
  files: ImportedFile[];
  result: {
    bills: number;
    purchases: number;
    rules: number;
    classified: number;
    restored: number;
    financing: number;
  };
  /** O relato linha a linha — os avisos vêm prefixados com "Atenção:". */
  log: string[];
}
