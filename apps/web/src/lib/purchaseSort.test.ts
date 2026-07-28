import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SORT, nextSort } from './purchaseSort';

describe('nextSort', () => {
  it('inverte a direção ao reclicar a mesma coluna', () => {
    const desc = nextSort({ key: 'title', direction: 'asc' }, 'title');
    assert.deepEqual(desc, { key: 'title', direction: 'desc' });
    assert.deepEqual(nextSort(desc, 'title'), { key: 'title', direction: 'asc' });
  });

  // O terceiro clique não volta a um estado sem nome: sempre há uma ordenação.
  it('nunca fica sem ordenação', () => {
    let sort = DEFAULT_SORT;
    for (let i = 0; i < 5; i++) sort = nextSort(sort, 'date');
    assert.equal(sort.key, 'date');
    assert.ok(sort.direction === 'asc' || sort.direction === 'desc');
  });

  // "Quais foram as maiores compras" e "quais foram as mais recentes" são as
  // perguntas que se faz nessas colunas — começar em ordem crescente daria a
  // resposta oposta no primeiro clique.
  it('abre em decrescente nas colunas de valor e data', () => {
    for (const key of ['amount', 'date', 'referenceMonth'] as const) {
      assert.equal(nextSort({ key: 'title', direction: 'asc' }, key).direction, 'desc');
    }
  });

  it('abre em crescente nas colunas de texto', () => {
    for (const key of ['title', 'category'] as const) {
      assert.equal(nextSort({ key: 'amount', direction: 'desc' }, key).direction, 'asc');
    }
  });
});
