import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Bill from '../interface/bill';
import { buildComposition, REST_KEY } from './billComposition';

/** O ciclo da fatura fecha no mês anterior ao do vencimento. */
function cycleEnd(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 2, 26)).toISOString().slice(0, 10);
}

function bill(month: string, categories: Record<string, number>): Bill {
  return {
    month,
    cycleEnd: cycleEnd(month),
    valuePaid: 0,
    total: Object.values(categories).reduce((acc, value) => acc + value, 0),
    // A composição é sobre gasto, e encargo não é gasto: ele não entra no
    // `categoriesResult` e não tem fatia na barra empilhada.
    charges: 0,
    frequency: Object.keys(categories).length,
    categoriesResult: Object.entries(categories).map(([categoryByMonth, totalCategory]) => ({
      categoryByMonth,
      totalCategory,
      frequency: 1,
      percentage: 0,
    })),
  };
}

describe('buildComposition', () => {
  it('devolve vazio sem faturas', () => {
    const composition = buildComposition([]);
    assert.deepEqual(composition.categories, []);
    assert.deepEqual(composition.points, []);
    assert.equal(composition.hasRest, false);
  });

  it('elege as maiores do período inteiro, da maior para a menor', () => {
    const composition = buildComposition(
      [bill('2025-01', { casa: 10, transporte: 100 }), bill('2025-02', { casa: 5, viagem: 50 })],
      2,
    );
    assert.deepEqual(composition.categories, ['transporte', 'viagem']);
  });

  // O ponto central: a cor precisa significar sempre a mesma categoria. Se cada
  // mês elegesse o próprio topo, a mesma faixa seria supermercado num mês e
  // transporte no outro.
  it('usa o mesmo topo em todos os meses, e não um topo por mês', () => {
    const composition = buildComposition(
      [
        bill('2025-01', { transporte: 100, casa: 1 }),
        // Em fevereiro casa é a maior do mês, mas perde no período inteiro.
        bill('2025-02', { casa: 20, transporte: 5 }),
      ],
      1,
    );

    assert.deepEqual(composition.categories, ['transporte']);
    assert.equal(composition.points[1].values.transporte, 5);
    assert.equal(composition.points[1].values[REST_KEY], 20);
  });

  it('junta em "demais" tudo que ficou fora do topo', () => {
    const composition = buildComposition(
      [bill('2025-01', { transporte: 100, casa: 10, lazer: 5, viagem: 2 })],
      1,
    );

    assert.equal(composition.points[0].values[REST_KEY], 17);
    assert.equal(composition.hasRest, true);
  });

  it('não cria a faixa "demais" quando tudo cabe no topo', () => {
    const composition = buildComposition([bill('2025-01', { transporte: 100, casa: 10 })], 6);
    assert.equal(composition.hasRest, false);
    assert.equal(composition.points[0].values[REST_KEY], undefined);
  });

  it('preserva a ordem cronológica das faturas', () => {
    const composition = buildComposition([
      bill('2025-01', { casa: 1 }),
      bill('2025-02', { casa: 1 }),
      bill('2025-03', { casa: 1 }),
    ]);
    assert.deepEqual(
      composition.points.map((point) => point.month),
      ['2025-01', '2025-02', '2025-03'],
    );
  });

  it('o total do ponto soma todas as categorias, inclusive as de "demais"', () => {
    const composition = buildComposition([bill('2025-01', { transporte: 100, casa: 10 })], 1);
    assert.equal(composition.points[0].total, 110);
  });

  // Estorno entra negativo e nunca está no topo: cai em "demais" e abate o mês,
  // que é o comportamento certo — o dinheiro voltou.
  it('deixa o estorno abater "demais" em vez de somar', () => {
    const composition = buildComposition(
      [bill('2025-01', { transporte: 100, casa: 30, estorno: -20 })],
      1,
    );
    assert.equal(composition.points[0].values[REST_KEY], 10);
  });
});
