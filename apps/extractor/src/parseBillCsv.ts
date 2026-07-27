import { Purchase } from './interfaces/purchase';

/**
 * Categorias inferidas por palavra-chave no título, para quando o CSV não traz
 * a coluna `category` e o título nunca apareceu categorizado antes.
 */
const KEYWORD_CATEGORIES: Record<string, string[]> = {
  transporte: ['uber', '99app', '99 app', 'cabify'],
};

const FALLBACK_CATEGORY = 'outros';

/**
 * Memória de categorização compartilhada entre as faturas de uma mesma execução:
 * quando um título aparece categorizado em qualquer mês, os meses em que ele veio
 * sem categoria herdam a mesma. É o que faz o histórico ficar consistente.
 */
export class CategoryMemory {
  private readonly titlesByCategory = new Map<string, Set<string>>();

  remember(category: string, title: string): void {
    const titles = this.titlesByCategory.get(category);
    if (titles) {
      titles.add(title);
    } else {
      this.titlesByCategory.set(category, new Set([title]));
    }
  }

  lookup(title: string): string | undefined {
    for (const [category, titles] of this.titlesByCategory) {
      if (titles.has(title)) return category;
    }
    return undefined;
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
  const known = memory.lookup(title);
  if (known) return known;

  const lower = title.toLowerCase();
  for (const [category, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
    if (keywords.some((keyword) => lower.includes(keyword))) return category;
  }

  return FALLBACK_CATEGORY;
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
  for (const row of rows) {
    if (row.category && row.title) memory.remember(row.category, row.title);
  }

  const purchases: Purchase[] = [];
  for (const row of rows) {
    const title = row.title;
    const amount = Number.parseFloat(row.amount);
    const date = new Date(row.date);

    if (!title || Number.isNaN(amount) || amount === 0 || Number.isNaN(date.getTime())) {
      continue;
    }

    purchases.push({
      title,
      amount,
      date,
      category: row.category || inferCategory(title, memory),
      referenceMonth,
    });
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
