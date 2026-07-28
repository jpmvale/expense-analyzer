import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Bill from '../interface/bill';
import type { RecurringCharge } from '../interface/recurring';
import { buildPriceChanges } from './priceChanges';

/** O ciclo da fatura fecha no mês anterior ao do vencimento. */
function cycleEnd(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 2, 26)).toISOString().slice(0, 10);
}

function bill(month: string): Bill {
  return {
    month,
    cycleEnd: cycleEnd(month),
    valuePaid: 0,
    total: 0,
    charges: 0,
    frequency: 0,
    categoriesResult: [],
  };
}

/** Seis faturas fechadas, de fev/26 a jul/26. */
const FATURAS = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'].map(bill);

function charge(overrides: Partial<RecurringCharge> = {}): RecurringCharge {
  return {
    key: 'spotify',
    title: 'Dm *Spotify',
    name: null,
    titles: ['Dm *Spotify'],
    charges: 20,
    months: 20,
    current: 23.9,
    previous: 21.9,
    change: 9.13,
    since: '2026-06-25T00:00:00.000Z',
    lastDate: '2026-07-25T00:00:00.000Z',
    active: true,
    plateaus: [],
    ...overrides,
  };
}

describe('buildPriceChanges', () => {
  it('traz o reajuste que caiu dentro da janela', () => {
    const [mudanca] = buildPriceChanges([charge()], FATURAS);

    assert.equal(mudanca.label, 'Dm *Spotify');
    assert.equal(mudanca.change, 9.13);
    // R$ 2,00 por mês, doze meses.
    assert.equal(mudanca.yearly, 24);
  });

  it('prefere o nome formal ao título do cartão', () => {
    const [mudanca] = buildPriceChanges([charge({ name: 'Spotify' })], FATURAS);
    assert.equal(mudanca.label, 'Spotify');
  });

  // Um aviso que aparece sempre deixa de ser aviso: o degrau antigo já está na
  // tela de Assinaturas, e não é notícia.
  it('ignora o reajuste anterior à janela', () => {
    const antigo = charge({ since: '2025-01-10T00:00:00.000Z' });
    assert.deepEqual(buildPriceChanges([antigo], FATURAS), []);
  });

  it('ignora assinatura sem degrau nenhum', () => {
    const precoUnico = charge({ previous: null, change: null });
    assert.deepEqual(buildPriceChanges([precoUnico], FATURAS), []);
  });

  // Reajuste em algo que não se paga mais não é decisão a tomar.
  it('ignora assinatura encerrada', () => {
    assert.deepEqual(buildPriceChanges([charge({ active: false })], FATURAS), []);
  });

  it('mostra também a queda de preço, que é mudança sem aviso do mesmo jeito', () => {
    const caiu = charge({ previous: 24.9, current: 19.9, change: -20.08 });
    const [mudanca] = buildPriceChanges([caiu], FATURAS);

    assert.equal(mudanca.yearly, -60);
  });

  // O que decide se vale olhar é quanto custa no ano, não quando aconteceu.
  it('ordena pela mordida anual, da maior para a menor', () => {
    const pequeno = charge({ key: 'a', previous: 10, current: 11 });
    const grande = charge({ key: 'b', previous: 80, current: 87 });

    assert.deepEqual(
      buildPriceChanges([pequeno, grande], FATURAS).map((m) => m.key),
      ['b', 'a'],
    );
  });

  it('sem fatura fechada, não há janela e nada é dito', () => {
    assert.deepEqual(buildPriceChanges([charge()], []), []);
  });

  // Base nova: sem histórico para recuar três ciclos, todo degrau ainda é
  // notícia — o contrário silenciaria a tela justamente em quem acabou de chegar.
  it('sem histórico para a janela inteira, aceita qualquer degrau', () => {
    const antigo = charge({ since: '2020-01-10T00:00:00.000Z' });
    assert.equal(buildPriceChanges([antigo], FATURAS.slice(-2)).length, 1);
  });
});
