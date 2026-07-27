import Purchase from './purchase';

/** Resposta de `GET /purchase`. Os agregados vêm sempre — inclusive zerados. */
interface ListPurchase {
  purchases: Purchase[];
  total: number;
  average: number;
  sum: number;
}

export default ListPurchase;
