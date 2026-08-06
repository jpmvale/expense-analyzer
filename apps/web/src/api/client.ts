import type Bill from '../interface/bill';
import type {
  Category,
  CategoryRule,
  ReapplyResult,
  RuleKind,
  UncategorizedTitle,
} from '../interface/category';
import type { ImportResult } from '../interface/import';
import type ListPurchase from '../interface/listPurchase';
import type { ConsolidationSuggestion, RuleUsage } from '../interface/rule';
import type { RecurringCharge } from '../interface/recurring';
import type { Session } from '../interface/session';
import type { SyncStatus } from '../interface/sync';

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

/**
 * `credentials: 'include'` em toda chamada: a API e o front vivem em portas
 * diferentes (3000 e 5173), e sem isso o cookie de sessão nunca sai do
 * navegador — a chamada chegaria sempre como anônima, mesmo logado.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { credentials: 'include', ...init });
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

export function listRules(): Promise<RuleUsage[]> {
  return getJson<RuleUsage[]>('/category-rule');
}

export function listConsolidations(): Promise<ConsolidationSuggestion[]> {
  return getJson<ConsolidationSuggestion[]>('/category-rule/consolidation');
}

/**
 * Aplica a consolidação: o trecho entra, as `exact` que ele cobre saem, e a base
 * é reaplicada **uma vez**. Fazer isso pela API de regras seria um `POST` e
 * cinquenta `DELETE`, cada um varrendo a base inteira.
 *
 * `exceptions` é o meio-termo entre aplicar mesmo assim e não aplicar: cada
 * título listado vira regra `exact` na categoria de agora antes de o trecho
 * entrar, então continua onde estava mesmo com o trecho alcançando-o.
 */
export function consolidateRules(suggestion: {
  value: string;
  category: string;
  exceptions?: Array<{ title: string; category: string }>;
}): Promise<{ created: number; deleted: number; exceptions: number } & ReapplyResult> {
  return sendJson('POST', '/category-rule/consolidate', suggestion);
}

/**
 * Esconde a sugestão da lista, pelo par que a identifica. Vai no corpo porque o
 * trecho carrega espaço e `*` (`shopee *`), que num path só funciona escapado.
 */
export function dismissConsolidation(suggestion: {
  value: string;
  category: string;
}): Promise<void> {
  return sendJson('POST', '/category-rule/consolidation/dismiss', suggestion);
}

export function restoreConsolidation(suggestion: {
  value: string;
  category: string;
}): Promise<void> {
  return sendJson('POST', '/category-rule/consolidation/restore', suggestion);
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

/**
 * Muda o trecho, o tipo ou o destino de uma regra que já existe, pelo id — ao
 * contrário de `saveRule`, que acha a regra pelo par `(kind, value)` e por isso
 * não serve para editar o próprio `value`.
 */
export function editRule(
  id: string,
  rule: { kind: RuleKind; value: string; category: string },
): Promise<{ rule: CategoryRule } & ReapplyResult> {
  return sendJson('PATCH', `/category-rule/${id}`, rule);
}

/**
 * Reclassifica a base com as regras e a tabela de encargo de agora, sem reextrair.
 * Idempotente: rodar de novo sem nada ter mudado devolve os três números em zero.
 */
export function reapplyRules(): Promise<ReapplyResult> {
  return request<ReapplyResult>('/category-rule/reapply', { method: 'POST' });
}

/** Se há uma sincronização rodando agora, e como terminou a última. */
export function getSyncStatus(): Promise<SyncStatus> {
  return getJson<SyncStatus>('/sync');
}

/**
 * Pede uma sincronização e volta na hora — a API responde 202 assim que aceita o
 * pedido, sem esperar a leitura das faturas terminar. Quem chama acompanha por
 * `getSyncStatus`. Um 409 aqui quer dizer que já havia uma em andamento.
 */
export function startSync(): Promise<SyncStatus> {
  return request<SyncStatus>('/sync', { method: 'POST' });
}

export function login(username: string, password: string): Promise<Session> {
  return sendJson('POST', '/auth/login', { username, password });
}

/**
 * Cria a conta e já entra nela — a API abre a sessão na mesma resposta, então
 * não há um segundo passo de login depois do cadastro.
 *
 * O código de convite é do servidor (`INVITE_CODE`), e não um segredo do
 * usuário: ele existe porque a instância fica exposta na internet e sem barreira
 * qualquer robô criaria conta.
 */
export function register(
  username: string,
  email: string,
  password: string,
  inviteCode: string,
): Promise<Session> {
  return sendJson('POST', '/auth/register', { username, email, password, inviteCode });
}

/**
 * Troca a senha de quem está logado. Devolve quantas **outras** sessões caíram
 * — a desta aba continua de pé.
 */
export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ sessionsEncerradas: number }> {
  return sendJson('POST', '/auth/change-password', { currentPassword, newPassword });
}

/**
 * Pede o link de redefinição. Responde igual exista ou não a conta — de
 * propósito, e é por isso que a tela não pode dizer "e-mail não encontrado".
 */
export function forgotPassword(email: string): Promise<void> {
  return sendJson('POST', '/auth/forgot-password', { email });
}

/** Fecha a redefinição com o token que veio no link do e-mail. */
export function resetPassword(token: string, newPassword: string): Promise<void> {
  return sendJson('POST', '/auth/reset-password', { token, newPassword });
}

export function logout(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST' });
}

export function getSession(): Promise<Session> {
  return getJson<Session>('/auth/session');
}

/**
 * Sobe faturas em CSV, que passam pelo mesmo pipeline do Drive: reenviar um mês
 * sobrescreve o que estava lá, e as regras do usuário são reaplicadas depois.
 *
 * `FormData` sem `content-type` na mão de propósito: o navegador precisa montar
 * o cabeçalho com o `boundary` do multipart, e defini-lo aqui geraria um corpo
 * que o servidor não consegue separar em arquivos.
 */
export function importCsvs(files: File[]): Promise<ImportResult> {
  const body = new FormData();
  for (const file of files) body.append('files', file);
  return request<ImportResult>('/import', { method: 'POST', body });
}
