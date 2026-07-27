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
  month?: Date | null;
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
    // Qualquer dia serve — a API filtra o mês inteiro da data informada.
    const year = month.getFullYear();
    const monthNumber = String(month.getMonth() + 1).padStart(2, '0');
    params.set('date', `${year}-${monthNumber}-15`);
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
