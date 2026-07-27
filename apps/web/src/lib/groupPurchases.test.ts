import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Purchase from '../interface/purchase';
import { groupByCategory, groupByMonth } from './groupPurchases';

function purchase(date: string, overrides: Partial<Purchase> = {}): Purchase {
  return {
    _id: date,
    title: 'COMPRA',
    category: 'outros',
    amount: 10,
    date,
    referenceMonth: `${date.slice(0, 7)}-01T00:00:00.000Z`,
    ...overrides,
  };
}

describe('groupByMonth', () => {
  it('devolve vazio sem compras', () => {
    assert.deepEqual(groupByMonth([]), []);
  });

  // Regressão: a chave do mês era lida com getMonth() — horário local — sobre
  // datas em UTC. Em UTC-3 toda compra do dia 1º caía no mês anterior, e o
  // gráfico abria com uma barra fantasma de um mês que não existia nos dados.
  it('mantém a compra do dia 1º no próprio mês, não no anterior', () => {
    const grouped = groupByMonth([purchase('2025-02-01T00:00:00.000Z')]);
    assert.deepEqual(
      grouped.map((g) => g.value),
      ['2025-02'],
    );
    assert.equal(grouped[0].data.length, 1);
  });

  it('preenche com zero os meses sem nenhuma compra', () => {
    const grouped = groupByMonth([
      purchase('2025-01-10T00:00:00.000Z'),
      purchase('2025-04-10T00:00:00.000Z'),
    ]);
    assert.deepEqual(
      grouped.map((g) => g.value),
      ['2025-01', '2025-02', '2025-03', '2025-04'],
    );
    assert.deepEqual(
      grouped.map((g) => g.data.length),
      [1, 0, 0, 1],
    );
  });

  // Regressão: o preenchimento ia até `new Date()`, então um recorte antigo
  // ganhava uma cauda de barras vazias até o mês corrente.
  it('termina na última compra, não no mês corrente', () => {
    const grouped = groupByMonth([
      purchase('2020-01-10T00:00:00.000Z'),
      purchase('2020-02-10T00:00:00.000Z'),
    ]);
    assert.deepEqual(
      grouped.map((g) => g.value),
      ['2020-01', '2020-02'],
    );
  });

  it('acumula várias compras no mesmo mês', () => {
    const grouped = groupByMonth([
      purchase('2025-05-01T00:00:00.000Z'),
      purchase('2025-05-31T00:00:00.000Z'),
    ]);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].data.length, 2);
  });
});

describe('groupByCategory', () => {
  it('agrupa por categoria preservando a ordem de aparição', () => {
    const grouped = groupByCategory([
      purchase('2025-01-02T00:00:00.000Z', { category: 'transporte' }),
      purchase('2025-01-03T00:00:00.000Z', { category: 'supermercado' }),
      purchase('2025-01-04T00:00:00.000Z', { category: 'transporte' }),
    ]);
    assert.deepEqual(
      grouped.map((g) => g.value),
      ['transporte', 'supermercado'],
    );
    assert.deepEqual(
      grouped.map((g) => g.data.length),
      [2, 1],
    );
  });
});
