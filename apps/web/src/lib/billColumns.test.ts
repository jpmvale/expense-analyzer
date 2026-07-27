import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Bill from '../interface/bill';
import { categoriesByVolume } from './billColumns';

function bill(month: string, categories: Record<string, number>): Bill {
  return {
    month,
    valuePaid: 0,
    total: Object.values(categories).reduce((acc, value) => acc + value, 0),
    frequency: Object.keys(categories).length,
    categoriesResult: Object.entries(categories).map(([categoryByMonth, totalCategory]) => ({
      categoryByMonth,
      totalCategory,
      frequency: 1,
      percentage: 0,
    })),
  };
}

describe('categoriesByVolume', () => {
  it('devolve vazio sem faturas', () => {
    assert.deepEqual(categoriesByVolume([]), []);
  });

  // Regressão: as colunas eram uma lista fixa de 12 categorias escrita à mão, e
  // qualquer categoria fora dela sumia da tela sem aviso, mesmo existindo na API.
  it('cria coluna para categoria que não estava na lista antiga', () => {
    assert.ok(categoriesByVolume([bill('2025-03', { pet: 100 })]).includes('pet'));
  });

  it('soma o volume de uma categoria ao longo de todas as faturas', () => {
    const columns = categoriesByVolume([
      bill('2025-03', { casa: 100, transporte: 60 }),
      bill('2025-04', { transporte: 90 }),
    ]);
    // transporte soma 150 e passa a casa, que ficou em 100.
    assert.deepEqual(columns, ['transporte', 'casa']);
  });

  // A ordem alfabética punha `estorno` (o menor) antes de `transporte` (o maior).
  it('ordena por volume, não alfabeticamente', () => {
    const columns = categoriesByVolume([
      bill('2025-03', { estorno: -10, transporte: 5000, casa: 200 }),
    ]);
    assert.deepEqual(columns, ['transporte', 'casa', 'estorno']);
  });

  it('desempata pelo nome, para a ordem não depender da iteração do Map', () => {
    const columns = categoriesByVolume([bill('2025-03', { viagem: 100, casa: 100, lazer: 100 })]);
    assert.deepEqual(columns, ['casa', 'lazer', 'viagem']);
  });

  it('não repete categoria que aparece em vários meses', () => {
    const columns = categoriesByVolume([
      bill('2025-03', { casa: 10 }),
      bill('2025-04', { casa: 10 }),
    ]);
    assert.deepEqual(columns, ['casa']);
  });
});
