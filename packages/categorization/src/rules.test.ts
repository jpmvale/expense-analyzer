import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assignTitles, categoryFromRules, ruleMatches, type CategoryRule } from './rules';

function rule(
  kind: CategoryRule['kind'],
  value: string,
  category: string,
  updatedAt?: string,
): CategoryRule {
  return { kind, value, category, updatedAt: updatedAt ? new Date(updatedAt) : undefined };
}

describe('ruleMatches', () => {
  it('casa o título inteiro, ignorando caixa e acento', () => {
    const mercadoLivre = rule('exact', 'Mercadolivre*Mercadol', 'mercado livre');

    assert.ok(ruleMatches(mercadoLivre, 'Mercadolivre*Mercadol'));
    assert.ok(ruleMatches(mercadoLivre, 'MERCADOLIVRE*MERCADOL'));
    // Mesmo estabelecimento, título mais longo: `exact` não alcança de propósito.
    assert.equal(ruleMatches(mercadoLivre, 'Mercadolivre*Mercadoli'), false);
  });

  // O título de fatura é cheio de `*`, `(` e `+`. Tratado como expressão regular,
  // `Mercadolivre*Mercadol` casaria com "Mercadoliv" seguido de qualquer coisa —
  // e uma regra sozinha engoliria compras que não têm nada a ver.
  it('trata o valor como texto, não como expressão regular', () => {
    assert.equal(ruleMatches(rule('exact', 'Mercadolivre*Mercadol', 'x'), 'Mercadolivr'), false);
    assert.equal(ruleMatches(rule('contains', 'c+a', 'x'), 'ccca'), false);
    assert.ok(ruleMatches(rule('contains', 'c+a', 'x'), 'loja c+a shopping'));
  });

  it('casa por trecho quando é `contains`', () => {
    const ml = rule('contains', 'mercadolivre', 'mercado livre');

    assert.ok(ruleMatches(ml, 'Mercadolivre*Mercadol'));
    assert.ok(ruleMatches(ml, 'MERCADOLIVRE*MERCADOLI'));
    assert.equal(ruleMatches(ml, 'Mercado São João'), false);
  });

  it('ignora regra de valor vazio, que casaria com tudo', () => {
    assert.equal(ruleMatches(rule('contains', '', 'x'), 'qualquer coisa'), false);
    assert.equal(ruleMatches(rule('contains', '   ', 'x'), 'qualquer coisa'), false);
  });
});

describe('categoryFromRules', () => {
  it('devolve null quando nenhuma regra alcança o título', () => {
    assert.equal(categoryFromRules('PADARIA BELA VISTA', [rule('exact', 'UBER *TRIP', 'x')]), null);
  });

  it('prefere o título exato ao trecho', () => {
    const rules = [
      rule('contains', 'mercadolivre', 'mercado livre'),
      rule('exact', 'Mercadolivre*Mercadol', 'eletrônicos'),
    ];

    assert.equal(categoryFromRules('Mercadolivre*Mercadol', rules), 'eletrônicos');
    // Nas variações, onde o `exact` não chega, o trecho continua valendo.
    assert.equal(categoryFromRules('Mercadolivre*Mercadoli', rules), 'mercado livre');
  });

  it('prefere o trecho mais longo entre dois `contains`', () => {
    const rules = [
      rule('contains', 'mercado', 'supermercado'),
      rule('contains', 'mercadolivre', 'mercado livre'),
    ];

    assert.equal(categoryFromRules('Mercadolivre*Mercadol', rules), 'mercado livre');
    assert.equal(categoryFromRules('MERCADO SAO JOAO', rules), 'supermercado');
  });

  it('desempata pela regra mais recente', () => {
    const rules = [
      rule('exact', 'AMAZON', 'eletrônicos', '2019-01-01'),
      rule('exact', 'AMAZON', 'serviços', '2026-01-01'),
    ];

    assert.equal(categoryFromRules('AMAZON', rules), 'serviços');
  });

  it('não depende da ordem em que as regras chegam', () => {
    const rules = [
      rule('exact', 'Mercadolivre*Mercadol', 'eletrônicos'),
      rule('contains', 'mercadolivre', 'mercado livre'),
      rule('contains', 'mercado', 'supermercado'),
    ];

    const invertido = [...rules].reverse();
    assert.equal(
      categoryFromRules('Mercadolivre*Mercadol', rules),
      categoryFromRules('Mercadolivre*Mercadol', invertido),
    );
  });
});

describe('assignTitles', () => {
  it('agrupa por categoria de destino e separa quem nenhuma regra alcança', () => {
    const { byCategory, unruled } = assignTitles(
      ['Mercadolivre*Mercadol', 'Mercadolivre*Mercadoli', 'UBER *TRIP', 'PADARIA BELA VISTA'],
      [rule('contains', 'mercadolivre', 'mercado livre'), rule('exact', 'UBER *TRIP', 'transporte')],
    );

    assert.deepEqual(byCategory.get('mercado livre'), [
      'Mercadolivre*Mercadol',
      'Mercadolivre*Mercadoli',
    ]);
    assert.deepEqual(byCategory.get('transporte'), ['UBER *TRIP']);
    assert.deepEqual(unruled, ['PADARIA BELA VISTA']);
  });

  it('decide cada título igual ao `categoryFromRules`', () => {
    const rules = [
      rule('contains', 'mercado', 'supermercado'),
      rule('contains', 'mercadolivre', 'mercado livre'),
      rule('exact', 'Mercadolivre*Mercadol', 'eletrônicos'),
    ];
    const titles = ['Mercadolivre*Mercadol', 'Mercadolivre*Mercadoli', 'MERCADO SAO JOAO', 'IFOOD'];

    const { byCategory, unruled } = assignTitles(titles, rules);
    for (const title of titles) {
      const expected = categoryFromRules(title, rules);
      if (expected === null) {
        assert.ok(unruled.includes(title));
      } else {
        assert.ok(byCategory.get(expected)?.includes(title));
      }
    }
  });

  it('não devolve categoria sem título', () => {
    const { byCategory } = assignTitles(['IFOOD'], [rule('exact', 'UBER *TRIP', 'transporte')]);
    assert.equal(byCategory.size, 0);
  });
});
