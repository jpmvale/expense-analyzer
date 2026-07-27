import { normalize } from '@expense/categorization';
import { round } from './bill-aggregation';

/** Só o que o agrupamento precisa saber de uma compra — desacopla do Mongoose. */
export interface UncategorizablePurchase {
  title: string;
  amount: number;
  date: Date;
}

export interface UncategorizedTitle {
  /** O estabelecimento, sem o sufixo de parcela. É o que a tela mostra. */
  title: string;
  /**
   * Os títulos crus que caem neste grupo, do mais frequente ao menos. Uma regra
   * `exact` alcança um só, então é daqui que a tela sabe se um basta.
   */
  titles: string[];
  frequency: number;
  total: number;
  /** A compra mais recente: separa o que ainda acontece do que morreu em 2019. */
  lastDate: Date;
  /**
   * A regra que classifica o grupo inteiro de uma vez.
   *
   * Um título só, sem parcela, vira `exact` — é o caso simples e é o que o
   * usuário espera de um clique. Assim que há mais de uma forma crua, `exact`
   * deixaria compras para trás, e a sugestão passa a ser `contains` no
   * estabelecimento.
   */
  suggestion: { kind: 'exact' | 'contains'; value: string };
}

/**
 * Tira o `- Parcela 2/5` do fim do título.
 *
 * O emissor numera cada parcela no próprio título, então uma compra parcelada em
 * cinco chega como cinco estabelecimentos diferentes. Na base real são 96 dos
 * 434 títulos sem categoria, com 28% do valor: sem juntá-los, a tela pediria
 * cinco decisões para uma compra e a lista pareceria cinco vezes maior do que é.
 */
export function stripInstallment(title: string): string {
  return title.replace(/\s*-\s*parcela\s+\d+\s*\/\s*\d+\s*$/i, '').trim();
}

/**
 * Agrupa as compras sem categoria por título, da maior soma para a menor.
 *
 * A ordem é por dinheiro parado, e não por data ou por quantidade, porque é ela
 * que faz a faxina valer a pena cedo: os primeiros títulos da lista são os que
 * mais mexem nos gráficos quando classificados. Uma ordenação cronológica
 * espalharia o mesmo esforço entre cafés de R$ 8 e uma passagem de R$ 2.600.
 *
 * A soma é em módulo. Um título sem categoria pode ter saldo perto de zero por
 * ter sido quase todo estornado, e ordenar pelo valor com sinal o esconderia no
 * fim da lista mesmo tendo dezenas de lançamentos para classificar.
 */
export function buildUncategorizedTitles(
  purchases: UncategorizablePurchase[],
): UncategorizedTitle[] {
  const groups = new Map<
    string,
    {
      raw: Map<string, number>;
      bases: Map<string, number>;
      frequency: number;
      total: number;
      lastDate: Date;
    }
  >();

  for (const purchase of purchases) {
    const base = stripInstallment(purchase.title);
    const key = normalize(base);
    const group = groups.get(key) ?? {
      raw: new Map<string, number>(),
      bases: new Map<string, number>(),
      frequency: 0,
      total: 0,
      lastDate: purchase.date,
    };

    group.raw.set(purchase.title, (group.raw.get(purchase.title) ?? 0) + 1);
    group.bases.set(base, (group.bases.get(base) ?? 0) + 1);
    group.frequency++;
    group.total += purchase.amount;
    if (purchase.date > group.lastDate) group.lastDate = purchase.date;

    groups.set(key, group);
  }

  const byFrequency = (a: [string, number], b: [string, number]) => b[1] - a[1];

  return [...groups.values()]
    .map((group) => {
      const raw = [...group.raw].sort(byFrequency).map(([title]) => title);
      const title = [...group.bases].sort(byFrequency)[0][0];

      return {
        title,
        titles: raw,
        frequency: group.frequency,
        total: round(group.total),
        lastDate: group.lastDate,
        // Uma forma crua só, e igual à base: `exact` resolve, e é a regra mais
        // estreita possível. Qualquer outra coisa — parcelas, caixa alternando —
        // e `exact` deixaria compras do mesmo lugar para trás.
        suggestion:
          raw.length === 1 && raw[0] === title
            ? ({ kind: 'exact', value: title } as const)
            : ({ kind: 'contains', value: title } as const),
      };
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}
