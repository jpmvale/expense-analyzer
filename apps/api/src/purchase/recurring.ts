import { normalize } from '@expense/categorization';
import { round } from './bill-aggregation';
import { stripInstallment } from './uncategorized';

/** Só o que a detecção precisa saber de uma compra — desacopla do Mongoose. */
export interface RecurringCandidate {
  title: string;
  amount: number;
  date: Date;
}

/** Um preço que valeu por um tempo: o valor e quantas cobranças o repetiram. */
export interface PricePlateau {
  amount: number;
  /** Quantas cobranças tiveram esse valor em sequência. */
  charges: number;
  /** Primeira cobrança do patamar — é a data em que o preço passou a valer. */
  since: Date;
}

export interface RecurringCharge {
  /**
   * A identidade estável do grupo: o título normalizado e sem o gateway.
   *
   * É a que um nome formal se prende, e é a única coisa aqui que dá para guardar
   * no banco. O título cru não serve: o mesmo Spotify já chegou sob oito
   * gateways, e um nome preso a `Dm *Spotify` se perderia no mês em que a
   * cobrança voltasse como `Ebn *Spotify`.
   *
   * O preço disso é que a chave depende de `stripGateway` e `normalize`: mudar
   * qualquer uma das duas pode reagrupar a base e deixar um nome órfão, apontando
   * para uma chave que não existe mais. Um nome órfão é inofensivo — a tela cai
   * de volta no título cru —, mas é invisível, e é o que se paga por não ter um
   * identificador que o emissor forneça.
   */
  key: string;
  /** A forma mais frequente do título. É o que a tela mostra sem nome formal. */
  title: string;
  /** Todas as formas cruas que caíram no grupo, da mais frequente à menos. */
  titles: string[];
  charges: number;
  /** Meses distintos em que houve cobrança. */
  months: number;
  /** O preço de hoje, ou o último que vigorou se a cobrança parou. */
  current: number;
  /** O preço imediatamente anterior, ou `null` se nunca mudou. */
  previous: number | null;
  /** Variação percentual de `previous` para `current`. `null` sem anterior. */
  change: number | null;
  /** Desde quando `current` vale. */
  since: Date;
  /** Data da última cobrança vista. */
  lastDate: Date;
  /** Se a cobrança ainda acontece — separa a notícia do arquivo morto. */
  active: boolean;
  /** A escada de preços inteira, do mais antigo ao mais novo. */
  plateaus: PricePlateau[];
}

/**
 * O intermediário que aparece grudado na frente do título.
 *
 * O mesmo Spotify chega como `Ebanx *Spotify`, `Ebw*Spotify`, `Ebn *Spotify` e
 * `Dm *Spotify` conforme o gateway que processou a cobrança muda de nome ao longo
 * dos anos — oito formas para uma assinatura só. Sem tirar o prefixo, a série de
 * preços se parte em oito pedaços curtos e a escada 8,50 → 23,90 desaparece.
 *
 * Só casa um token curto colado num `*`, e repete porque há títulos com dois
 * (`Uber *Uber *Trip`). O que vem depois do primeiro `*` é preservado: é lá que
 * mora o estabelecimento de verdade, e cortar até o último `*` faria
 * `Ifood *Ifd*Dominos` e `Ifood *Ifd*Farmacia` virarem o mesmo lugar.
 */
export function stripGateway(title: string): string {
  let stripped = title;

  for (let i = 0; i < 3; i++) {
    const next = stripped.replace(/^[a-z0-9]{1,12}\s?\*\s*/, '');
    if (next === stripped) break;
    stripped = next;
  }

  return stripped.trim();
}

/**
 * Quebra a série em patamares: corridas de cobranças com o valor idêntico.
 *
 * A comparação é em centavos inteiros para não depender de igualdade de ponto
 * flutuante — `19.90` somado e dividido em outro lugar do sistema pode voltar
 * como `19.900000000000002`, e aí cada cobrança viraria um patamar próprio.
 */
function toPlateaus(sorted: RecurringCandidate[]): PricePlateau[] {
  const plateaus: Array<PricePlateau & { cents: number }> = [];

  for (const purchase of sorted) {
    const cents = Math.round(purchase.amount * 100);
    const last = plateaus[plateaus.length - 1];

    if (last && last.cents === cents) last.charges++;
    else plateaus.push({ cents, amount: cents / 100, charges: 1, since: purchase.date });
  }

  return plateaus.map(({ amount, charges, since }) => ({ amount, charges, since }));
}

/** Um patamar de uma cobrança só ainda não é preço: pode ser taxa ou avulso. */
const MIN_CHARGES_PER_PLATEAU = 2;

/** Abaixo disso não há série: qualquer coisa parece um padrão em três pontos. */
const MIN_CHARGES = 6;

/**
 * Cobranças por patamar, na média.
 *
 * É o que separa assinatura de consumo, e é a única regra que realmente decide.
 * `Comercial Ovolar` tem 45 compras em cadência quase mensal, mas o valor
 * oscila entre R$ 21 e R$ 28 sem parar: 21 patamares, média 2,1. A Netflix tem
 * 52 cobranças em 3 patamares, média 17,3. Cadência não distingue os dois —
 * `Uber *Uber *Trip` aparece 43 meses seguidos com 43 valores diferentes.
 */
const MIN_CHARGES_PER_PLATEAU_AVG = 3;

/**
 * Cobranças por mês. Assinatura cobra uma vez; acima disso é frequência de uso.
 *
 * Tira o `Ifood *Ifd*Dominos P`, que tem 24 cobranças em 9 meses alternando
 * entre dois preços de promoção e passaria por assinatura em qualquer outra
 * regra. Não é 1,0 exato porque a data de cobrança desliza: uma assinatura pode
 * cair dia 31 de um mês e dia 1º do seguinte, e o mês de referência conta duas.
 */
const MAX_CHARGES_PER_MONTH = 1.5;

/** Meses sem cobrar depois dos quais a assinatura conta como encerrada. */
const INACTIVE_AFTER_MONTHS = 2;

function monthIndex(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

/**
 * Encontra as cobranças recorrentes e o degrau de preço de cada uma.
 *
 * É a pergunta que só este sistema responde: o app do banco sabe quanto se
 * gastou no mês, mas não tem oito anos de série contínua para dizer que a
 * assinatura subiu 28% em maio e ninguém percebeu.
 *
 * O que define recorrência aqui é o **patamar**, não a cadência. Uma assinatura
 * é uma série feita de poucos preços longos, e um degrau é a passagem de um
 * patamar para o outro. Ordenar por cadência traria todo estabelecimento
 * visitado toda semana.
 *
 * Estornos ficam de fora porque um valor negativo não é preço, e parcelamentos
 * porque uma compra dividida em dez é dez cobranças mensais idênticas — a
 * assinatura mais convincente que existe, e não é uma.
 */
export function buildRecurringCharges(
  purchases: RecurringCandidate[],
  today = new Date(),
): RecurringCharge[] {
  const groups = new Map<string, { titles: Map<string, number>; items: RecurringCandidate[] }>();

  for (const purchase of purchases) {
    if (purchase.amount <= 0) continue;
    if (stripInstallment(purchase.title) !== purchase.title.trim()) continue;

    const key = stripGateway(normalize(purchase.title));
    if (!key) continue;

    const group = groups.get(key) ?? { titles: new Map<string, number>(), items: [] };
    group.titles.set(purchase.title, (group.titles.get(purchase.title) ?? 0) + 1);
    group.items.push(purchase);
    groups.set(key, group);
  }

  const latestMonth = purchases.reduce(
    (acc, purchase) => Math.max(acc, monthIndex(purchase.date)),
    monthIndex(today),
  );

  const found: RecurringCharge[] = [];

  for (const [key, group] of groups) {
    const sorted = [...group.items].sort((a, b) => a.date.getTime() - b.date.getTime());
    if (sorted.length < MIN_CHARGES) continue;

    const months = new Set(sorted.map((purchase) => monthIndex(purchase.date))).size;
    if (months < MIN_CHARGES) continue;
    if (sorted.length / months > MAX_CHARGES_PER_MONTH) continue;

    const plateaus = toPlateaus(sorted);
    if (sorted.length / plateaus.length < MIN_CHARGES_PER_PLATEAU_AVG) continue;

    // O preço vigente é o último que se repetiu. Uma cobrança solitária no fim
    // da série ainda não é preço novo: pode ser um avulso, e tratá-la como
    // preço faria a tela anunciar um reajuste que não existe.
    const stable = plateaus.filter((plateau) => plateau.charges >= MIN_CHARGES_PER_PLATEAU);
    if (stable.length === 0) continue;

    const current = stable[stable.length - 1];
    const previous = stable.length >= 2 ? stable[stable.length - 2] : null;
    const lastDate = sorted[sorted.length - 1].date;

    const [title, ...rest] = [...group.titles.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([raw]) => raw);

    found.push({
      key,
      title,
      titles: [title, ...rest],
      charges: sorted.length,
      months,
      current: current.amount,
      previous: previous ? previous.amount : null,
      change: previous ? round(((current.amount - previous.amount) / previous.amount) * 100) : null,
      since: current.since,
      lastDate,
      active: latestMonth - monthIndex(lastDate) <= INACTIVE_AFTER_MONTHS,
      plateaus,
    });
  }

  // As ativas primeiro: um reajuste que você ainda paga é notícia, um de 2019 é
  // arquivo. Dentro de cada grupo, o maior degrau em módulo — uma queda de 20%
  // importa tanto quanto uma alta, e é a que ninguém vai atrás de conferir.
  return found.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0) ||
      b.current - a.current,
  );
}
