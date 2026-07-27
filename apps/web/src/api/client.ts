import type Bill from '../interface/bill';
import type ListPurchase from '../interface/listPurchase';

/**
 * Base da API. Vem de VITE_API_URL (.env da raiz); o default cobre o caso de
 * quem só rodou `pnpm dev` sem configurar nada.
 */
const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export interface PurchaseFilters {
  categories?: string[];
  title?: string;
  /** Mês da fatura em `YYYY-MM` — o mesmo formato que a API recebe. */
  month?: string | null;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`A API respondeu ${response.status} em ${path}`);
  }
  return response.json() as Promise<T>;
}

export function buildPurchasesQuery({ categories, title, month }: PurchaseFilters): string {
  const params = new URLSearchParams();
  if (categories && categories.length > 0) params.set('category', categories.join(','));
  if (title) params.set('title', title);
  if (month) {
    // O seletor da tela se chama "Fatura", então filtra pelo mês da fatura
    // (`month`) e não pela data da compra (`date`) — os dois campos existem na
    // API e são diferentes de propósito. `YYYY-MM` trafega como string do
    // seletor até a query, sem passar por um Date, onde o fuso já mordeu antes.
    params.set('month', month);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function listPurchases(filters: PurchaseFilters): Promise<ListPurchase> {
  return getJson<ListPurchase>(`/purchase${buildPurchasesQuery(filters)}`);
}

export function listBills(): Promise<Bill[]> {
  return getJson<Bill[]>('/purchase/bill');
}
