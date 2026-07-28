import { FALLBACK_CATEGORY, FINANCING_CATEGORY } from './categories';
import { categoryFromKeywords, isFinancingTitle } from './keywords';
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
  /**
   * Os títulos que a ingestão resolveu para esta categoria.
   *
   * A reaplicação usa isto para saber quem *era* encargo: sem essa lista, tirar
   * uma palavra-chave da tabela não teria efeito, porque devolver à ingestão
   * devolveria a `encargos` de novo.
   */
  titlesWithSourceCategory(category: string): Promise<string[]>;
}

export interface ReapplyResult {
  /** Compras que mudaram de categoria por causa de uma regra. */
  classified: number;
  /** Compras devolvidas à categoria da ingestão por não haver mais regra. */
  restored: number;
  /**
   * Compras que a camada de encargo reescreveu, nos dois sentidos: as que a lista
   * de palavras-chave de agora mandou para `encargos` e as que ela tirou de lá.
   *
   * Separado de `classified` porque altera **quanto** se gastou no mês, e não
   * apenas como o gasto se reparte — vale dizer em voz alta.
   */
  financing: number;
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
 *
 * A camada de encargo é redecidida aqui e não herdada da ingestão, ao contrário
 * das outras palavras-chave. É a única que muda quanto se gastou, e mantê-la
 * congelada em `sourceCategory` significava que corrigir a lista só valia a partir
 * do próximo `pnpm extract` — inalcançável para quem não tem mais os CSVs.
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

  const { financing, rederived, restorable } = await splitFinancing(store, unruled);

  let financingWrites = 0;
  if (financing.length > 0) {
    financingWrites += await store.setCategoryForTitles(financing, FINANCING_CATEGORY);
  }
  for (const [category, categoryTitles] of rederived) {
    financingWrites += await store.setCategoryForTitles(categoryTitles, category);
  }

  const restored = restorable.length > 0 ? await store.restoreSourceCategory(restorable) : 0;

  return { classified, restored, financing: financingWrites };
}

/**
 * Reparte os títulos sem regra em três destinos, redecidindo a camada de encargo.
 *
 * A regra do usuário continua ganhando de tudo — estes são só os títulos que
 * nenhuma alcança. Entre os que sobram:
 *
 * - **`financing`**: a tabela de palavras-chave de agora diz que é encargo. Vai
 *   para `encargos` mesmo que a ingestão tenha resolvido outra coisa, e é isso que
 *   faz uma palavra-chave nova valer para o que já está no banco.
 * - **`rederived`**: a ingestão resolveu `encargos` e a tabela de agora não diz
 *   mais isso. Não dá para devolver à ingestão, que insistiria em `encargos`;
 *   como nada além da palavra-chave produz essa categoria — o emissor não a
 *   emite, e nenhum alias aponta para ela —, refazer a inferência pelo título é
 *   exatamente o que a ingestão faria hoje.
 * - **`restorable`**: o caso comum. Volta para `sourceCategory`, onde moram a
 *   categoria do emissor e a memória por título, que a palavra-chave não deve
 *   atropelar.
 */
async function splitFinancing(
  store: PurchaseStore,
  unruled: string[],
): Promise<{ financing: string[]; rederived: Map<string, string[]>; restorable: string[] }> {
  const financing: string[] = [];
  const maybeStale: string[] = [];
  const restorable: string[] = [];

  for (const title of unruled) {
    if (isFinancingTitle(title)) financing.push(title);
    else maybeStale.push(title);
  }

  const rederived = new Map<string, string[]>();
  if (maybeStale.length === 0) return { financing, rederived, restorable };

  // Só vale perguntar ao banco se há candidato a sair de `encargos`.
  const ingested = new Set(await store.titlesWithSourceCategory(FINANCING_CATEGORY));

  for (const title of maybeStale) {
    if (!ingested.has(title)) {
      restorable.push(title);
      continue;
    }
    const category = categoryFromKeywords(title) ?? FALLBACK_CATEGORY;
    const bucket = rederived.get(category);
    if (bucket) bucket.push(title);
    else rederived.set(category, [title]);
  }

  return { financing, rederived, restorable };
}
