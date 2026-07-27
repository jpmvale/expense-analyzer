/** Um preço que valeu por um tempo. A escada é feita destes degraus. */
export interface PricePlateau {
  amount: number;
  charges: number;
  /** ISO — primeira cobrança do patamar, quando o preço passou a valer. */
  since: string;
}

export interface RecurringCharge {
  title: string;
  /** Todas as formas cruas do título: o mesmo Spotify chega sob oito gateways. */
  titles: string[];
  charges: number;
  months: number;
  current: number;
  previous: number | null;
  /** Variação de `previous` para `current`, em pontos percentuais. */
  change: number | null;
  since: string;
  lastDate: string;
  active: boolean;
  plateaus: PricePlateau[];
}
