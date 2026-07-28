import type { Bill } from './bill-aggregation';
import type { RecurringCharge } from './recurring';

/** Uma assinatura com nome — o suficiente para o aviso, sem acoplar ao serviço. */
export type NamedCharge = RecurringCharge & { name?: string | null };

export interface PriceAlert {
  key: string;
  /** O nome formal quando existe; senão, o título como a fatura o escreve. */
  label: string;
  previous: number;
  current: number;
  /** Variação em pontos percentuais. */
  change: number;
  since: Date;
  /**
   * Quanto o degrau custa em doze meses, se o preço ficar onde está.
   *
   * É o número que transforma "+8,8%" em decisão — um reajuste de R$ 7 numa
   * assinatura mensal são R$ 84 por ano, e percentual sozinho não diz se vale a
   * pena cancelar.
   */
  yearly: number;
}

/** Quantos ciclos fechados contam como "agora". Mesmo valor da Visão geral. */
export const RECENT_CYCLES = 3;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Os reajustes que apareceram nos últimos ciclos fechados — a mesma lista que o
 * cartão "Mudou de preço" da Visão geral mostra, só que como rota própria.
 *
 * Existe separada da tela porque nem todo consumo desta lista tem uma pessoa
 * olhando o navegador no momento certo: um cron pessoal ou um atalho de celular
 * pode perguntar a mesma coisa sem abrir nada. A API não manda a notificação
 * sozinha — só responde "o que mudou", de um jeito que dá para plugar em
 * qualquer canal depois.
 *
 * A lógica é idêntica à de `apps/web/src/lib/priceChanges.ts`: o recorte é o fim
 * do ciclo, não o mês da fatura, e a fronteira é o fim do ciclo **anterior** à
 * janela, para os `cycles` mais recentes entrarem inteiros. As datas aqui são
 * UTC, e não o dia local do navegador — todo o resto da API já data por UTC
 * (`monthKey`, `billCycleEnd`), e esta rota fala com um script, não com alguém
 * vendo a tela na hora da virada do dia.
 */
export function buildPriceAlerts(
  charges: NamedCharge[],
  closedBills: Bill[],
  cycles = RECENT_CYCLES,
): PriceAlert[] {
  if (closedBills.length === 0) return [];

  const boundary = closedBills[closedBills.length - cycles - 1]?.cycleEnd;

  return charges
    .filter(
      (charge): charge is NamedCharge & { previous: number; change: number } =>
        charge.active &&
        charge.previous !== null &&
        charge.change !== null &&
        (boundary === undefined || dayKey(charge.since) > boundary),
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
    // Maior mordida no ano primeiro — o que decide se vale olhar é quanto
    // custa, não quando aconteceu.
    .sort((a, b) => Math.abs(b.yearly) - Math.abs(a.yearly));
}
