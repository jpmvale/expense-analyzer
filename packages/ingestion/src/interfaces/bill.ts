import { Purchase } from './purchase';

export interface Bill {
  /** Primeiro dia (em UTC) do mês da fatura. */
  referenceMonth: Date;
  data: Purchase[];
}
