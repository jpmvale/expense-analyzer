import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPaging, buildSortSpec, DEFAULT_LIMIT, MAX_LIMIT, toSummary } from './purchase-query';

describe('buildSortSpec', () => {
  it('ordena pela coluna pedida', () => {
    assert.deepEqual(buildSortSpec('amount', 'asc'), { amount: 1, _id: 1 });
    assert.deepEqual(buildSortSpec('title', 'desc'), { title: -1, _id: -1 });
  });

  // Sem desempate a paginação mente: ordenando por uma coluna com milhares de
  // empates, o Mongo não promete a mesma ordem entre duas consultas, e a mesma
  // compra pode sair na página 1 e de novo na 2 enquanto outra não sai em nenhuma.
  it('sempre desempata por _id', () => {
    for (const campo of ['title', 'amount', 'category', 'referenceMonth', 'date'] as const) {
      assert.ok('_id' in buildSortSpec(campo, 'asc'), `${campo} ficou sem desempate`);
    }
  });

  it('abre pelo mais recente', () => {
    assert.deepEqual(buildSortSpec(), { date: -1, _id: -1 });
  });
});

describe('buildPaging', () => {
  it('converte página 1-based em skip', () => {
    assert.deepEqual(buildPaging(1, 50), { page: 1, limit: 50, skip: 0 });
    assert.deepEqual(buildPaging(3, 25), { page: 3, limit: 25, skip: 50 });
  });

  it('usa o padrão quando não vem nada', () => {
    assert.deepEqual(buildPaging(), { page: 1, limit: DEFAULT_LIMIT, skip: 0 });
  });

  // Sem teto, `?limit=999999` traria a coleção inteira e desfaria a paginação.
  it('prende o limite ao teto', () => {
    assert.equal(buildPaging(1, 999_999).limit, MAX_LIMIT);
  });

  it('não aceita página nem limite abaixo de um', () => {
    assert.deepEqual(buildPaging(0, 10), { page: 1, limit: 10, skip: 0 });
    assert.deepEqual(buildPaging(-5, -5), { page: 1, limit: DEFAULT_LIMIT, skip: 0 });
  });
});

describe('toSummary', () => {
  const facet = {
    totals: [{ total: 3, sum: 300 }],
    byMonth: [
      { _id: '2026-01', total: 100, count: 1 },
      { _id: '2026-02', total: 200, count: 2 },
    ],
    byCategory: [
      { _id: 'transporte', totalCategory: 200, frequency: 2 },
      { _id: 'restaurante', totalCategory: 100, frequency: 1 },
    ],
  };

  it('dá forma aos agregados', () => {
    const resumo = toSummary(facet);

    assert.equal(resumo.total, 3);
    assert.equal(resumo.sum, 300);
    assert.equal(resumo.average, 100);
    assert.deepEqual(resumo.byMonth[0], { month: '2026-01', total: 100, count: 1 });
    assert.equal(resumo.byCategory[0].categoryByMonth, 'transporte');
    assert.equal(resumo.byCategory[0].percentage, (200 * 100) / 300);
  });

  // Um filtro que não casa com nada devolve `totals` vazio, e não um zero: sem
  // os defaults a tela mostraria NaN ao buscar por um título que não existe.
  it('devolve zeros, e não NaN, quando o filtro não casa com nada', () => {
    const vazio = toSummary({ totals: [], byMonth: [], byCategory: [] });

    assert.deepEqual(vazio, { total: 0, sum: 0, average: 0, byMonth: [], byCategory: [] });
  });

  it('aguenta o facet ausente', () => {
    assert.equal(toSummary(undefined).total, 0);
  });

  it('não divide por zero quando a soma se anula', () => {
    const anulado = toSummary({
      totals: [{ total: 2, sum: 0 }],
      byMonth: [],
      byCategory: [{ _id: 'estorno', totalCategory: -50, frequency: 1 }],
    });

    assert.equal(anulado.average, 0);
    assert.equal(anulado.byCategory[0].percentage, 0);
  });
});
