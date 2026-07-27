import Purchase from './purchase';

interface ListPurchase {
  purchases: Purchase[];
  total?: number;
  average?: number;
  sum?: number;
}

export default ListPurchase;
