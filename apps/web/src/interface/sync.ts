/** Uma execução da ingestão, como a API a devolve em `/sync`. */
export interface SyncRun {
  /**
   * `manual` é o botão desta tela; `cli` é o `pnpm extract` e o cron da VPS;
   * `upload` é o envio de CSVs pela tela de Importar.
   */
  trigger: 'manual' | 'cli' | 'upload';
  status: 'running' | 'ok' | 'error';
  startedAt: string;
  finishedAt?: string;
  bills?: number;
  purchases?: number;
  rules?: number;
  classified?: number;
  restored?: number;
  financing?: number;
  /** A mensagem do erro, quando `status` é `error`. */
  message?: string;
  /** O relato linha a linha — os avisos vêm prefixados com "Atenção:". */
  log?: string[];
}

export interface SyncStatus {
  running: boolean;
  lastRun: SyncRun | null;
}
