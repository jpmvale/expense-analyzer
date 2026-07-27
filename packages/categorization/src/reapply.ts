import { assignTitles, type CategoryRule } from './rules';

/**
 * O pouco que a reaplicação precisa saber sobre o banco. A API fala Mongoose e o
 * extractor fala o driver cru; o que não pode divergir entre os dois é a decisão
 * de qual título vai para qual categoria, e essa mora aqui.
 *
 * **Todo método que escreve deve ignorar as compras cuja `sourceCategory` é
 * reservada** (`isReservedCategory` — na prática, o pagamento da fatura). O
 * filtro é por documento e não por título, porque o mesmo título pode ser uma
 * compra num mês e outra coisa no mês seguinte.
 */
export interface PurchaseStore {
  /** Os títulos distintos da base, incluindo os que nenhuma regra alcança. */
  distinctTitles(): Promise<string[]>;
  /** Carimba a categoria nas compras destes títulos. Devolve quantas mudaram. */
  setCategoryForTitles(titles: string[], category: string): Promise<number>;
  /** Devolve estas compras à categoria que a ingestão tinha resolvido. */
  restoreSourceCategory(titles: string[]): Promise<number>;
}

export interface ReapplyResult {
  /** Compras que mudaram de categoria por causa de uma regra. */
  classified: number;
  /** Compras devolvidas à categoria da ingestão por não haver mais regra. */
  restored: number;
}

/**
 * Reescreve a categoria de toda a base a partir das regras do usuário.
 *
 * É o único lugar que grava categoria depois da ingestão, e roda inteiro em três
 * momentos: quando uma regra nasce, muda ou morre, e depois de cada `pnpm
 * extract`. Rodar inteiro em vez de calcular o delta é o que mantém a operação
 * idempotente e reversível — a categoria vem sempre de `sourceCategory` mais as
 * regras de agora, nunca do que estava gravado antes. É também o que faz apagar
 * uma regra funcionar: sem o valor original guardado ao lado, não haveria para
 * onde voltar.
 *
 * O custo é varrer a coleção a cada mudança. Numa base pessoal — alguns milhares
 * de compras, algumas centenas de títulos distintos — isso é uma escrita por
 * categoria envolvida, e some no tempo da requisição.
 */
export async function reapplyRules(
  store: PurchaseStore,
  rules: CategoryRule[],
): Promise<ReapplyResult> {
  const titles = await store.distinctTitles();
  const { byCategory, unruled } = assignTitles(titles, rules);

  let classified = 0;
  for (const [category, categoryTitles] of byCategory) {
    classified += await store.setCategoryForTitles(categoryTitles, category);
  }

  const restored = unruled.length > 0 ? await store.restoreSourceCategory(unruled) : 0;

  return { classified, restored };
}
