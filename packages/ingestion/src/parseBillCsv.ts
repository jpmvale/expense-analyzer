import {
  aliasForCategory,
  categoryFromKeywords,
  FALLBACK_CATEGORY,
} from '@expense/categorization';
import { Purchase } from './interfaces/purchase';

/**
 * Converte o valor da fatura em número, aceitando os dois formatos que o emissor
 * mistura — às vezes no mesmo arquivo.
 *
 *   -3110.02       ponto decimal, como sempre foi
 *   "- 2.944,60"   ponto de milhar, vírgula decimal, espaço depois do sinal
 *
 * O segundo formato apareceu a partir de abril de 2025 e devolvia `NaN` no
 * `parseFloat`, o que fazia a linha ser descartada sem aviso: 55 lançamentos
 * sumiram assim, incluindo quase todos os "Pagamento recebido" desde então, que é
 * por que a coluna "Valor pago" ficou vazia de abril de 2025 em diante.
 *
 * A regra é a vírgula: se existe, ela é o separador decimal e os pontos são de
 * milhar. Sem vírgula, o ponto é decimal. Fica ambíguo só para um valor como
 * `1.234` sem casas decimais, que o formato antigo nunca produziu.
 */
export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/\s/g, '');
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  return Number.parseFloat(normalized);
}

/**
 * Memória de categorização compartilhada entre as faturas de uma mesma execução:
 * quando um título aparece categorizado em qualquer mês, os meses em que ele veio
 * sem categoria herdam a mesma. É o que faz o histórico ficar consistente.
 *
 * Um mesmo estabelecimento pode ter recebido categorias diferentes ao longo dos
 * anos: no histórico real, "Amazon" aparece 35 vezes como eletrônicos e 1 como
 * vestuário. Guardar só o primeiro visto entregava o desempate à ordem de
 * leitura, e uma ocorrência solitária derrubava trinta e cinco. Por isso a
 * memória conta as ocorrências e devolve a mais frequente.
 *
 * O empate é real — "Mercadolivre*Mercadol" tem uma ocorrência de cada em três
 * categorias diferentes — e quem vence é a **mais recente**: se um
 * estabelecimento mudou de natureza, a classificação de agora vale mais que a de
 * 2019. Isso funciona porque as faturas são lidas em ordem cronológica, o que os
 * dois `sources` garantem explicitamente.
 */
export class CategoryMemory {
  private readonly countsByTitle = new Map<string, Map<string, number>>();

  remember(category: string, title: string): void {
    const counts = this.countsByTitle.get(title) ?? new Map<string, number>();
    const next = (counts.get(category) ?? 0) + 1;

    // Reinserir move a chave para o fim do Map: a ordem de iteração passa a ser
    // "quem foi visto por último", que é o critério de desempate do lookup.
    counts.delete(category);
    counts.set(category, next);
    this.countsByTitle.set(title, counts);
  }

  lookup(title: string): string | undefined {
    const counts = this.countsByTitle.get(title);
    if (!counts) return undefined;

    let best: string | undefined;
    let bestCount = 0;

    for (const [category, count] of counts) {
      // `>=` faz o empate cair para o último da ordem, isto é, o mais recente.
      if (count >= bestCount) {
        best = category;
        bestCount = count;
      }
    }

    return best;
  }
}

/**
 * Divide uma linha de CSV respeitando aspas — títulos de compra com vírgula
 * ("MERCADO SAO JOAO, LTDA") desalinhavam todas as colunas com um split simples.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      // Aspas duplas escapadas ("") viram uma aspa literal.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

function inferCategory(title: string, memory: CategoryMemory): string {
  // A memória vem antes da palavra-chave: o histórico do próprio usuário sabe
  // mais sobre um estabelecimento do que uma regra genérica.
  const known = memory.lookup(title);
  if (known) return known;

  return categoryFromKeywords(title) ?? FALLBACK_CATEGORY;
}

/**
 * Se a categoria que veio no CSV vale alguma coisa.
 *
 * `outros` não vale: em julho/2024 o emissor parou de categorizar e passou a
 * carimbar `outros` em quase tudo — 4% dos lançamentos em junho contra 31% em
 * julho, chegando a 90% em 2025. Como `outros` é uma string não-vazia, ele
 * curto-circuitava o `||` e desligava a herança por título justamente no período
 * em que ela era mais necessária. Tratá-lo como "não sei" religa a inferência.
 */
function isMeaningfulCategory(category: string): boolean {
  return Boolean(category) && category !== FALLBACK_CATEGORY && !aliasForCategory(category);
}

export interface ParsedBill {
  purchases: Purchase[];
  /** Linhas ignoradas por não terem título, valor ou data utilizáveis. */
  discarded: number;
}

/**
 * Converte o CSV de uma fatura em compras. Espera um cabeçalho com, no mínimo,
 * `date`, `title` e `amount`; `category` é opcional (inferida quando ausente).
 *
 * As regras do usuário **não** entram aqui. O parser resolve a `sourceCategory`
 * — alias, categoria do CSV, memória, palavra-chave, `outros` — e as regras são
 * aplicadas depois da gravação, pelo mesmo `reapplyRules` que a API chama quando
 * uma regra muda. Manter a ingestão ignorante das regras é o que garante uma
 * escada só: se o parser também as aplicasse, haveria duas implementações da
 * mesma precedência para divergir.
 *
 * Devolve também quantas linhas foram descartadas. Antes elas sumiam caladas, e
 * foi assim que 55 lançamentos em formato brasileiro ficaram meses fora da base
 * sem ninguém perceber — o sintoma visível era uma coluna vazia na tela, longe da
 * causa. Contar é o que transforma isso em algo que aparece na hora.
 */
export function parseBillCsv(
  csv: string,
  referenceMonth: Date,
  memory: CategoryMemory,
): ParsedBill {
  const lines = csv.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) return { purchases: [], discarded: 0 };

  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, i) => [header, values[i] ?? '']));
  });

  // Primeira passada: registra o que já vem categorizado, para a segunda passada
  // poder inferir mesmo quando o título categorizado aparece depois no arquivo.
  //
  // Códigos internos ficam de fora da memória de propósito: eles descrevem o tipo
  // da transação, não o estabelecimento. Lembrar que "PADARIA BELA VISTA" apareceu
  // uma vez como estorno faria as compras normais da padaria virarem estorno nos
  // meses em que viessem sem categoria.
  for (const row of rows) {
    if (row.title && isMeaningfulCategory(row.category)) {
      memory.remember(row.category, row.title);
    }
  }

  const purchases: Purchase[] = [];
  let discarded = 0;

  for (const row of rows) {
    const title = row.title;
    const amount = parseAmount(row.amount);
    const date = new Date(row.date);

    if (!title || Number.isNaN(amount) || amount === 0 || Number.isNaN(date.getTime())) {
      discarded++;
      continue;
    }

    // Um código interno vira rótulo de domínio; uma categoria que diz alguma
    // coisa é respeitada; o resto — vazio ou `outros` — vai para a inferência.
    const alias = aliasForCategory(row.category);
    const sourceCategory =
      alias ??
      (isMeaningfulCategory(row.category) ? row.category : inferCategory(title, memory));

    // Nasce com as duas iguais. `reapplyRules` roda logo depois da gravação e
    // reescreve `category` onde alguma regra do usuário alcançar.
    purchases.push({
      title,
      amount,
      date,
      category: sourceCategory,
      sourceCategory,
      referenceMonth,
    });
  }

  return { purchases, discarded };
}

/**
 * Extrai o mês de referência do nome do arquivo (`nubank-2024-03.csv`).
 * Retorna `null` quando o nome não bate com o padrão.
 */
export function referenceMonthFromFileName(fileName: string): Date | null {
  const match = fileName.match(/(\d{4})-(\d{2})/);
  if (!match) return null;
  return new Date(`${match[1]}-${match[2]}-01T00:00:00.000Z`);
}

/**
 * Adivinha o mês de referência pelas datas de dentro do arquivo: o mês em que
 * caiu a maior parte das compras.
 *
 * É o plano B do upload, e só dele. Quem baixa a fatura do app do banco recebe
 * um nome como `Nubank_2024-03-15.csv` ou `fatura (3).csv`, e exigir que
 * renomeasse antes de subir seria transformar o padrão interno do extractor em
 * tarefa do usuário. O nome continua tendo precedência quando traz `AAAA-MM` —
 * ele é a intenção declarada, e esta função é só inferência.
 *
 * Inferência com limite conhecido: uma fatura tem compras do fim do mês anterior
 * e parcelas lançadas à frente, então o mês *majoritário* é o palpite certo, e
 * não o mais antigo nem o mais recente. Empate cai no mais recente, pelo mesmo
 * critério do resto do parser: se dois meses disputam, o de agora vale mais.
 */
export function referenceMonthFromRows(csv: string): Date | null {
  const lines = csv.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) return null;

  const dateColumn = splitCsvLine(lines[0]).indexOf('date');
  if (dateColumn === -1) return null;

  const counts = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const raw = splitCsvLine(line)[dateColumn];
    const date = new Date(raw);
    if (!raw || Number.isNaN(date.getTime())) continue;

    // Pelo `Date` já interpretado, e não por um `slice` da string: um arquivo
    // com data fora do ISO (`15/03/2024`) daria um "mês" sem sentido no corte,
    // e ele viraria a referência do arquivo inteiro sem ninguém perceber.
    const month = date.toISOString().slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }

  let best: string | undefined;
  let bestCount = 0;
  for (const [month, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    // `>=` sobre a lista ordenada faz o empate cair no mês mais recente.
    if (count >= bestCount) {
      best = month;
      bestCount = count;
    }
  }

  return best ? new Date(`${best}-01T00:00:00.000Z`) : null;
}
