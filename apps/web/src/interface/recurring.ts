/** Um preço que valeu por um tempo. A escada é feita destes degraus. */
export interface PricePlateau {
  amount: number;
  charges: number;
  /** ISO — primeira cobrança do patamar, quando o preço passou a valer. */
  since: string;
}

export interface RecurringCharge {
  /**
   * Identidade estável do grupo — título normalizado e sem gateway (`spotify`).
   * É a ela que o nome formal se prende, e é o que a tela manda de volta para a
   * API ao batizar ou desbatizar.
   */
  key: string;
  /** A forma crua mais frequente, como vem no cartão (`Dm *Spotify`). */
  title: string;
  /** O nome que o usuário deu, ou `null` — aí a tela mostra o `title`. */
  name: string | null;
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
