import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Bill from '../interface/bill';
import { buildBillColumns } from './billColumns';

function bill(month: string, categories: string[]): Bill {
  return {
    month,
    valuePaid: 0,
    total: 0,
    frequency: categories.length,
    categoriesResult: categories.map((categoryByMonth) => ({
      categoryByMonth,
      totalCategory: 10,
      frequency: 1,
      percentage: 10,
    })),
  };
}

const FIXED = ['month', 'valuePaid', 'total', 'frequency'];

describe('buildBillColumns', () => {
  it('mantém as colunas fixas na frente', () => {
    assert.deepEqual(
      buildBillColumns([]).map((c) => c.id),
      FIXED,
    );
  });

  // Regressão: as colunas eram uma lista fixa de 12 categorias escrita à mão, e
  // qualquer categoria fora dela sumia da tela sem aviso, mesmo existindo na API.
  it('cria coluna para categoria que não estava na lista antiga', () => {
    const columns = buildBillColumns([bill('2025-03', ['pet', 'supermercado'])]);
    assert.ok(columns.some((c) => c.id === 'pet'));
  });

  it('une as categorias de todos os meses, sem repetir', () => {
    const columns = buildBillColumns([
      bill('2025-03', ['casa', 'transporte']),
      bill('2025-04', ['transporte', 'viagem']),
    ]);

    assert.deepEqual(
      columns.map((c) => c.id),
      [...FIXED, 'casa', 'transporte', 'viagem'],
    );
  });

  it('ordena as categorias respeitando acentos do português', () => {
    const columns = buildBillColumns([bill('2025-03', ['viagem', 'eletrônicos', 'água', 'casa'])]);

    assert.deepEqual(
      columns.slice(FIXED.length).map((c) => c.id),
      ['água', 'casa', 'eletrônicos', 'viagem'],
    );
  });

  it('capitaliza o rótulo preservando o resto do nome', () => {
    const columns = buildBillColumns([bill('2025-03', ['eletrônicos'])]);
    assert.equal(columns.at(-1)?.label, 'Eletrônicos');
  });

  it('formata percentual e usa "-" para categoria ausente no mês', () => {
    const [categoria] = buildBillColumns([bill('2025-03', ['casa'])]).slice(FIXED.length);

    assert.equal(categoria.formatPercentage?.(12.5), '12.50%');
    assert.equal(categoria.formatPercentage?.(0), '-');
  });
});
