import type Bill from '@/interface/bill';

export interface CategoryExpectation {
  category: string;
  /** O que a categoria gastou no mês avaliado. */
  current: number;
  /** O que era de se esperar: mediana dos meses anteriores. */
  baseline: number;
  difference: number;
  /** Variação percentual, ou `null` quando a mediana é zero. */
  change: number | null;
  /**
   * A quantos desvios normais da própria categoria o mês está.
   *
   * Fica fora da tela de propósito — é o filtro, não a notícia. Uma categoria
   * muito previsível tem desvio minúsculo, e aí um mês fora da curva dá z=47,
   * que é matematicamente certo e ilegível. Quem lê quer reais e percentual.
   */
  deviations: number;
  /** Em quantos meses da janela houve gasto. Menos que isso não faz "normal". */
  months: number;
}

/** Quantos meses formam a expectativa. */
const WINDOW = 12;

/**
 * Meses com gasto exigidos na janela.
 *
 * Uma categoria que aparece em quatro dos doze meses não tem "normal" — tem
 * esporadicidade, e comparar contra ela produziria alarme toda vez que a compra
 * acontecesse. Na base de referência isso corta `viagem` (1/12), `eletrônicos`
 * (1/12), `Shein` (2/12), `Carro` e `casa` (4/12) e `vestuário` (5/12).
 */
const MIN_MONTHS = 6;

/**
 * Piso em reais. Percentual sozinho mente na escala pequena: uma categoria de
 * R$ 12 que vai a R$ 30 subiu 150% e não mudou nada na sua vida.
 */
const MIN_DIFFERENCE = 150;

/**
 * A quantos desvios o mês precisa estar para virar notícia.
 *
 * É o corte que separa sinal de ruído, e é o motivo de não usar percentual aqui:
 * num mês da base de referência, um limiar de "40% fora da média" acusava quatro
 * categorias, e duas eram oscilação normal — `serviços` a −49% estava a 0,7
 * desvio, e `Bebidas` a −51% estava a 0,4. Amazon, no mesmo mês, estava a 13,6.
 *
 * Já foi 2,5, calibrado sobre doze meses de uma série que atrasava um ciclo (o
 * recorte de fatura fechada estava errado). Refeita a conta sobre 24 meses da
 * série certa, 2,5 rendia 1,3 alerta por mês e **oito** meses calados em 24 —
 * mais quieto do que se queria, e a um custo concreto: silenciava `Mercado Livre`
 * a R$ 1.392 acima do normal (z=2,44) e `supermercado` a +R$ 584 (z=2,43).
 *
 * A 2,25 saem 1,6 alertas por mês com seis meses calados em 24, que é a mira
 * original — mês silencioso continua sendo resposta, não falha. Os seis alertas
 * que 2,25 acrescenta em 24 meses são todos gasto real; nenhum é `outros`. Baixar
 * mais não paga: 2,0 acrescenta seis e dobra a presença de `outros`.
 */
const MIN_DEVIATIONS = 2.25;

/** Converte o desvio absoluto mediano na escala do desvio-padrão. */
const MAD_TO_SIGMA = 1.4826;

/**
 * A categoria de fallback fica fora da comparação.
 *
 * Espelha `FALLBACK_CATEGORY` de `@expense/categorization`, que o front não
 * consome — o pacote é compartilhado entre a ingestão e a API, e arrastá-lo para
 * cá por uma string custaria mais do que resolve.
 *
 * Ela não descreve consumo: na base de referência oscila entre 0,7% e 18,1% do
 * mês, e o que move isso é quanto você classificou, não quanto gastou. Os quatro
 * alertas que ela gerava em 24 meses diziam "R$ 540 em não-classificado contra
 * R$ 12 de normal" — notícia sobre a fila da tela *Sem categoria*, não sobre
 * gasto. E o alerta seria inacionável: não dá para cortar `outros`.
 */
const FALLBACK_CATEGORY = 'outros';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function spentOn(bill: Bill, category: string): number {
  return bill.categoriesResult.find((c) => c.categoryByMonth === category)?.totalCategory ?? 0;
}

/**
 * O que fugiu do normal na última fatura, por categoria.
 *
 * "Restaurante: R$ 359" não diz se é muito. O sistema descrevia sem comparar, e
 * três telas de leitura não davam uma decisão. Aqui cada categoria é comparada
 * contra o próprio histórico — e o "normal" de cada uma é diferente: a Academia
 * varia 7% ao mês, `lazer` varia 94%, e o mesmo desvio percentual significa
 * coisas opostas nas duas.
 *
 * A referência é a **mediana**, não a média: uma viagem de R$ 2.600 num mês
 * levantaria a média de transporte pelo ano inteiro e esconderia justamente o
 * mês em que o gasto fugiu. E a dispersão é medida pelo desvio absoluto mediano
 * pelo mesmo motivo — o desvio-padrão é inflado pelo próprio pico que se quer
 * detectar.
 */
export function buildCategoryExpectations(
  closed: Bill[],
  { window = WINDOW, minMonths = MIN_MONTHS, minDifference = MIN_DIFFERENCE, minDeviations = MIN_DEVIATIONS } = {},
): CategoryExpectation[] {
  if (closed.length < window + 1) return [];

  const latest = closed[closed.length - 1];
  // A janela exclui o mês avaliado: incluí-lo o faria participar do próprio
  // referencial e amassar o desvio que se quer medir.
  const history = closed.slice(-(window + 1), -1);

  const categories = new Set<string>();
  for (const bill of history) for (const c of bill.categoriesResult) categories.add(c.categoryByMonth);
  for (const c of latest.categoriesResult) categories.add(c.categoryByMonth);

  const found: CategoryExpectation[] = [];

  for (const category of categories) {
    if (category === FALLBACK_CATEGORY) continue;

    // O mês sem a categoria conta como zero, e isso é o ponto: deixar de gastar
    // é tão informativo quanto gastar demais, e pular o mês faria a mediana
    // descrever só os meses em que houve compra.
    const series = history.map((bill) => spentOn(bill, category));
    const months = series.filter((value) => value > 0).length;
    if (months < minMonths) continue;

    const current = spentOn(latest, category);
    const baseline = median(series);
    const difference = current - baseline;
    if (Math.abs(difference) < minDifference) continue;

    const sigma = median(series.map((value) => Math.abs(value - baseline))) * MAD_TO_SIGMA;

    // Dispersão zero significa categoria perfeitamente previsível — a Academia
    // cobrou os mesmos R$ 149,90 doze vezes. Qualquer movimento ali é
    // extraordinário por definição, e dividir por zero não diria isso. O sinal
    // vem da diferença: parar de cobrar é infinitamente atípico para baixo.
    const deviations =
      sigma > 0 ? difference / sigma : Math.sign(difference) * Number.POSITIVE_INFINITY;
    if (Math.abs(deviations) < minDeviations) continue;

    found.push({
      category,
      current,
      baseline,
      difference,
      change: baseline > 0 ? (difference / baseline) * 100 : null,
      deviations,
      months,
    });
  }

  // Por dinheiro, não por desvio: R$ 826 acima do normal importa mais que uma
  // categoria de R$ 40 que triplicou, mesmo com z maior.
  return found.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
}
