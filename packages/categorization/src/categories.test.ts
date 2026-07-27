import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aliasForCategory,
  isReservedCategory,
  isSpendingCategory,
  NON_SPENDING_CATEGORIES,
} from './categories';
import { categoryFromKeywords } from './keywords';

describe('isSpendingCategory', () => {
  it('deixa de fora o pagamento da fatura e os encargos', () => {
    assert.equal(isSpendingCategory('payment'), false);
    assert.equal(isSpendingCategory('encargos'), false);
    assert.deepEqual([...NON_SPENDING_CATEGORIES], ['payment', 'encargos']);
  });

  // Os três entram na soma como qualquer categoria: `estorno` com valor negativo,
  // abatendo. Tratá-los como não-gasto mudaria o total do mês, que não é o que
  // eles significam — só descrevem o tipo do lançamento.
  it('conta estorno, impostos e parcelado como gasto', () => {
    for (const category of ['estorno', 'impostos', 'parcelado', 'outros', 'supermercado']) {
      assert.ok(isSpendingCategory(category), category);
    }
  });
});

describe('isReservedCategory', () => {
  it('reserva só o pagamento da fatura', () => {
    assert.ok(isReservedCategory('payment'));
  });

  // Regressão de desenho: os três já foram reservados junto com `payment`, sob o
  // argumento de que uma regra apontando para eles quebraria o total. Não quebra
  // — eles somam como qualquer categoria. O custo da proteção a mais era real:
  // as compras vindas de `bnpl_*` ficavam presas em `parcelado`, que diz como se
  // pagou e não onde se gastou, e não havia como mandar um IOF para `impostos`.
  it('não reserva estorno, impostos, parcelado nem encargos', () => {
    for (const category of ['estorno', 'impostos', 'parcelado', 'encargos']) {
      assert.equal(isReservedCategory(category), false, category);
    }
  });
});

describe('encargos', () => {
  // "Saldo em atraso" era o maior lançamento sem categoria da base de
  // referência: R$ 10.023 em três linhas, contados como consumo.
  it('reconhece pelo título o que o emissor cobra por atraso', () => {
    for (const title of [
      'Saldo em atraso',
      'Crédito de atraso',
      'Multa de atraso',
      'IOF de atraso',
      'Juros de dívida encerrada',
      'Anuidade diferenciada',
    ]) {
      assert.equal(categoryFromKeywords(title), 'encargos', title);
    }
  });

  // O IOF de uma compra internacional é imposto sobre um gasto que aconteceu de
  // verdade — não é o custo de financiar, e não pode sair do total.
  it('não confunde o IOF de uma compra com o do atraso', () => {
    assert.notEqual(categoryFromKeywords('IOF de Steam Purchase'), 'encargos');
    assert.notEqual(categoryFromKeywords('IOF de compra internacional'), 'encargos');
  });
});

describe('aliasForCategory', () => {
  it('traduz as famílias de código interno do emissor', () => {
    assert.equal(aliasForCategory('reversal_brazil_settled'), 'estorno');
    assert.equal(aliasForCategory('tax_foreign'), 'impostos');
    assert.equal(aliasForCategory('bnpl_transaction_upfront_national'), 'parcelado');
    assert.equal(aliasForCategory('supermercado'), null);
  });
});
