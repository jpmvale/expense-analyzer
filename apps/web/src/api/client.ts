import type Bill from '../interface/bill';
import type {
  Category,
  CategoryRule,
  ReapplyResult,
  RuleKind,
  UncategorizedTitle,
} from '../interface/category';
import type ListPurchase from '../interface/listPurchase';
import type { RecurringCharge } from '../interface/recurring';

/**
 * Base da API. Vem de VITE_API_URL (.env da raiz); o default cobre o caso de
 * quem só rodou `pnpm dev` sem configurar nada.
 */
const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** As colunas por que a API deixa ordenar. Espelha `SORTABLE_FIELDS` no back. */
export type SortableField = 'title' | 'amount' | 'category' | 'referenceMonth' | 'date';
export type SortOrder = 'asc' | 'desc';

export interface PurchaseFilters {
  categories?: string[];
  title?: string;
  /** Mês da fatura em `YYYY-MM` — o mesmo formato que a API recebe. */
  month?: string | null;
  /** Página, começando em 1. */
  page?: number;
  limit?: number;
  sort?: SortableField;
  order?: SortOrder;
}

/**
 * A mensagem que a API mandou, quando ela mandou uma.
 *
 * As rotas de escrita recusam por motivos que só elas conhecem — categoria
 * repetida, categoria em uso, nome protegido — e o texto do erro é a explicação
 * que a tela mostra. Um "A API respondeu 409" no lugar dela não diria nada.
 */
async function readError(response: Response, path: string): Promise<Error> {
  try {
    const body = await response.json();
    const message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
    if (message) return new Error(message);
  } catch {
    // Resposta sem corpo JSON: fica a mensagem genérica abaixo.
  }
  return new Error(`A API respondeu ${response.status} em ${path}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  if (!response.ok) throw await readError(response, path);
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

function getJson<T>(path: string): Promise<T> {
  return request<T>(path);
}

function sendJson<T>(method: 'POST' | 'PATCH', path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function buildPurchasesQuery({
  categories,
  title,
  month,
  page,
  limit,
  sort,
  order,
}: PurchaseFilters): string {
  const params = new URLSearchParams();
  if (categories && categories.length > 0) params.set('category', categories.join(','));
  if (title) params.set('title', title);
  // Paginação e ordenação são do servidor: a tabela mostra o que vem, sem
  // reordenar nem fatiar. Ordenar só a página aberta ordenaria cinquenta linhas
  // e chamaria isso de ordem — o erro que a migração existe para evitar.
  if (page && page > 1) params.set('page', String(page));
  if (limit) params.set('limit', String(limit));
  if (sort) params.set('sort', sort);
  if (order) params.set('order', order);
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

export function listRecurring(): Promise<RecurringCharge[]> {
  return getJson<RecurringCharge[]>('/purchase/recurring');
}

/**
 * Batiza a assinatura. A chave vai no corpo e não na URL porque ela é o título
 * normalizado — carrega espaço e `*` (`ifd*dominos p`), e um path com isso dentro
 * só funciona escapado.
 */
export function nameSubscription(key: string, name: string): Promise<{ key: string; name: string }> {
  return sendJson('POST', '/subscription', { key, name });
}

/** Aqui a chave vai na URL, escapada, porque DELETE não leva corpo. */
export function clearSubscriptionName(key: string): Promise<void> {
  return request<void>(`/subscription/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

export function listUncategorized(): Promise<UncategorizedTitle[]> {
  return getJson<UncategorizedTitle[]>('/purchase/uncategorized');
}

export function listCategories(): Promise<Category[]> {
  return getJson<Category[]>('/category');
}

export function createCategory(name: string): Promise<Category> {
  return sendJson<Category>('POST', '/category', { name });
}

export function listRules(): Promise<CategoryRule[]> {
  return getJson<CategoryRule[]>('/category-rule');
}

/**
 * Cria ou atualiza a regra. A API reclassifica na mesma requisição e devolve
 * quantas compras mudaram — é o número que a tela mostra de volta, para a ação
 * ter uma consequência visível mesmo quando a lista não muda de tamanho.
 */
export function saveRule(rule: {
  kind: RuleKind;
  value: string;
  category: string;
}): Promise<{ rule: CategoryRule } & ReapplyResult> {
  return sendJson('POST', '/category-rule', rule);
}

export function deleteRule(id: string): Promise<ReapplyResult> {
  return request<ReapplyResult>(`/category-rule/${id}`, { method: 'DELETE' });
}
