import type Bill from '@/interface/bill';
import type { RecurringCharge } from '@/interface/recurring';

export interface PriceChange {
  key: string;
  /** O nome formal quando existe; senão, o título como o cartão o escreve. */
  label: string;
  previous: number;
  current: number;
  /** Variação em pontos percentuais. */
  change: number;
  since: string;
  /**
   * Quanto o degrau custa em doze meses, se o preço ficar onde está.
   *
   * É o número que transforma "+8,8%" em decisão. Um reajuste de R$ 7 numa
   * assinatura mensal são R$ 84 por ano, e é assim que ele deve ser lido —
   * percentual sozinho não diz se vale a pena cancelar.
   */
  yearly: number;
}

/** Quantos ciclos fechados contam como "agora" na Visão geral. */
export const RECENT_CYCLES = 3;

/**
 * Os reajustes que apareceram nos últimos ciclos fechados.
 *
 * A tela de Assinaturas já mostra a escada inteira de cada uma; o que faltava era
 * o degrau **novo** chegar sem ser procurado. Esta lista existe para a Visão
 * geral, que é a tela do momento atual, e por isso ela se cala quando não houve
 * reajuste: um aviso que aparece sempre deixa de ser aviso.
 *
 * O recorte usa o fim do ciclo, e não o mês da fatura, pelo mesmo motivo que o
 * resto da Visão geral: `month` nomeia o mês do vencimento, e o consumo vem do
 * anterior. A fronteira é o fim do ciclo **anterior** à janela — assim os
 * `RECENT_CYCLES` ciclos entram inteiros, em vez de o mais antigo entrar pela
 * metade.
 *
 * Assinatura encerrada fica de fora mesmo que tenha subido de preço no caminho:
 * um reajuste em algo que não se paga mais não é uma decisão a tomar.
 */
export function buildPriceChanges(
  charges: RecurringCharge[],
  closedBills: Bill[],
  cycles = RECENT_CYCLES,
): PriceChange[] {
  if (closedBills.length === 0) return [];

  // Sem histórico suficiente para recuar `cycles` ciclos, a janela vira "tudo o
  // que existe" — é o caso de uma base nova, onde todo degrau ainda é notícia.
  const boundary = closedBills[closedBills.length - cycles - 1]?.cycleEnd;

  return charges
    .filter(
      (charge): charge is RecurringCharge & { previous: number; change: number } =>
        charge.active &&
        charge.previous !== null &&
        charge.change !== null &&
        (boundary === undefined || charge.since.slice(0, 10) > boundary),
    )
    .map((charge) => ({
      key: charge.key,
      label: charge.name ?? charge.title,
      previous: charge.previous,
      current: charge.current,
      change: charge.change,
      since: charge.since,
      yearly: Math.round((charge.current - charge.previous) * 12 * 100) / 100,
    }))
    // Maior mordida no ano primeiro, e não a mais recente: o que decide se vale
    // olhar é quanto custa, não quando aconteceu.
    .sort((a, b) => Math.abs(b.yearly) - Math.abs(a.yearly));
}
