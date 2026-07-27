import { Purchase } from './interfaces/purchase';

/**
 * Categorias inferidas por palavra-chave no título, para quando o CSV não traz
 * categoria útil e o título nunca apareceu categorizado antes.
 *
 * As chaves casam por trecho do título, já sem acento e em caixa baixa, então
 * `ifd*` pega `Ifd*Pampas Real` e `Ifd*Idayanne Conceicao` de uma vez. São
 * marcas e ramos, nunca meio de pagamento: `nupay` aparece tanto em
 * `iFood - NuPay` quanto em `E-AÍ CLUBE AUTOMOBILISTA S.A. - NuPay` e não diz
 * nada sobre o tipo do gasto.
 */
const KEYWORD_CATEGORIES: Record<string, string[]> = {
  transporte: ['uber', '99app', '99 app', 'cabify', 'posto ', 'estacionamento', 'combustivel'],
  restaurante: [
    'ifood',
    'ifd*',
    'ze delivery',
    'restaurante',
    'pizzaria',
    'burger',
    'gastrobar',
    'padaria',
    'casa de paes',
    'lanchonete',
    'cafe ',
  ],
  supermercado: [
    'mateus',
    'armazzem',
    'emporio',
    'supermerc',
    'mercadinho',
    'hortifruti',
    'atacad',
  ],
  // As chaves são o nome da categoria como ela já existe na base — com acento,
  // senão `saude` viraria uma categoria separada de `saúde`.
  saúde: ['drogasil', 'drogaria', 'farmacia', 'academia', 'smart fit', 'clinica', 'laboratorio'],
  serviços: ['google', 'youtube', 'spotify', 'netflix', 'amazon prime', 'microsoft', 'openai'],
  lazer: ['sinuca', 'cinema', 'clube da bola', 'q-ball', 'arena '],
};

const FALLBACK_CATEGORY = 'outros';

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

/** Caixa baixa e sem acento — usado só na comparação por palavra-chave. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * O Nubank mistura códigos internos de transação no campo `category`
 * (`reversal_brazil_settled`, `tax_foreign`, `bnpl_transaction_upfront_national`).
 * Eles não são tipos de gasto, e vazavam crus para a tela: cada variação virava
 * uma coluna própria na tabela de faturas e uma fatia na pizza.
 *
 * As famílias são traduzidas para um rótulo só do domínio. São prefixos, e não a
 * lista exata de códigos, porque o Nubank cria variações novas (`_settled`,
 * `_due`, `_national`, `_foreign`) sem aviso.
 */
const CATEGORY_ALIASES: Array<[RegExp, string]> = [
  [/^reversal_/, 'estorno'],
  [/^tax_/, 'impostos'],
  [/^bnpl_/, 'parcelado'],
];

/** Rótulo de domínio para um código interno, ou `null` se não for um deles. */
export function aliasForCategory(category: string): string | null {
  for (const [pattern, label] of CATEGORY_ALIASES) {
    if (pattern.test(category)) return label;
  }
  return null;
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

  const normalized = normalize(title);
  for (const [category, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return category;
  }

  return FALLBACK_CATEGORY;
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

/**
 * Converte o CSV de uma fatura em compras. Espera um cabeçalho com, no mínimo,
 * `date`, `title` e `amount`; `category` é opcional (inferida quando ausente).
 * Linhas sem data, título ou valor são descartadas.
 */
export function parseBillCsv(
  csv: string,
  referenceMonth: Date,
  memory: CategoryMemory,
): Purchase[] {
  const lines = csv.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];

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
  for (const row of rows) {
    const title = row.title;
    const amount = parseAmount(row.amount);
    const date = new Date(row.date);

    if (!title || Number.isNaN(amount) || amount === 0 || Number.isNaN(date.getTime())) {
      continue;
    }

    // Um código interno vira rótulo de domínio; uma categoria que diz alguma
    // coisa é respeitada; o resto — vazio ou `outros` — vai para a inferência.
    const alias = aliasForCategory(row.category);
    const category =
      alias ??
      (isMeaningfulCategory(row.category) ? row.category : inferCategory(title, memory));

    purchases.push({ title, amount, date, category, referenceMonth });
  }

  return purchases;
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
