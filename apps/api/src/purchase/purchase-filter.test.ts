import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPurchaseFilter } from './purchase-filter';

/** Lê os limites de um filtro de intervalo como ISO, pra asserção legível. */
function range(value: unknown): { gte: string; lt: string } {
  const { $gte, $lt } = value as { $gte: Date; $lt: Date };
  return { gte: $gte.toISOString(), lt: $lt.toISOString() };
}

describe('buildPurchaseFilter', () => {
  it('exclui pagamentos por padrão', () => {
    assert.deepEqual(buildPurchaseFilter({}).category, { $ne: 'payment' });
  });

  // Regressão: um `amount: { $gt: 0 }` escondia os estornos aqui, enquanto o
  // /purchase/bill os somava — os dois endpoints discordavam do total do mês.
  it('não corta por valor, para os estornos aparecerem', () => {
    assert.equal(buildPurchaseFilter({}).amount, undefined);
  });

  describe('filtro por data da compra', () => {
    it('cobre o mês inteiro em UTC, independente do fuso da máquina', () => {
      assert.deepEqual(range(buildPurchaseFilter({ date: '2025-03-15' }).date), {
        gte: '2025-03-01T00:00:00.000Z',
        lt: '2025-04-01T00:00:00.000Z',
      });
    });

    // Regressão: os limites eram montados com `new Date(ano, mês, dia)`, em
    // horário local. Em UTC-3 o início virava 2025-03-01T03:00Z e a compra
    // gravada em 2025-03-01T00:00Z ficava de fora — sumia uma compra por mês.
    it('inclui a compra do dia 1º, gravada à meia-noite UTC', () => {
      const { $gte } = buildPurchaseFilter({ date: '2025-03-15' }).date as { $gte: Date };
      assert.ok(new Date('2025-03-01T00:00:00.000Z') >= $gte);
    });

    // Regressão: `date=2025-03-01` devolvia fevereiro inteiro, porque a data
    // era parseada como UTC e depois lida em local, recuando um dia.
    it('não escorrega para o mês anterior quando o dia informado é o 1º', () => {
      assert.deepEqual(range(buildPurchaseFilter({ date: '2025-03-01' }).date), {
        gte: '2025-03-01T00:00:00.000Z',
        lt: '2025-04-01T00:00:00.000Z',
      });
    });

    it('vira o ano corretamente em dezembro', () => {
      assert.deepEqual(range(buildPurchaseFilter({ date: '2025-12-20' }).date), {
        gte: '2025-12-01T00:00:00.000Z',
        lt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('filtro por mês da fatura', () => {
    it('casa com o primeiro dia do mês em UTC, como o extractor grava', () => {
      const query = buildPurchaseFilter({ month: '2025-03' });
      assert.equal((query.referenceMonth as Date).toISOString(), '2025-03-01T00:00:00.000Z');
    });

    it('é independente do filtro por data da compra', () => {
      const query = buildPurchaseFilter({ month: '2025-03', date: '2025-02-28' });
      assert.equal((query.referenceMonth as Date).toISOString(), '2025-03-01T00:00:00.000Z');
      assert.deepEqual(range(query.date), {
        gte: '2025-02-01T00:00:00.000Z',
        lt: '2025-03-01T00:00:00.000Z',
      });
    });
  });

  describe('filtro por categoria', () => {
    it('aceita várias categorias separadas por vírgula, ignorando espaços', () => {
      const query = buildPurchaseFilter({ category: 'supermercado, transporte' });
      assert.deepEqual(query.category, { $in: ['supermercado', 'transporte'] });
    });

    // Regressão: escolher categorias substituía o `$ne: payment`, então
    // `?category=payment` devolvia os pagamentos que o endpoint promete ocultar.
    it('não deixa os pagamentos vazarem via ?category=payment', () => {
      assert.deepEqual(buildPurchaseFilter({ category: 'payment' }).category, { $in: [] });
      assert.deepEqual(buildPurchaseFilter({ category: 'payment,transporte' }).category, {
        $in: ['transporte'],
      });
    });
  });

  describe('busca por título', () => {
    it('busca parcial, sem diferenciar maiúsculas', () => {
      assert.deepEqual(buildPurchaseFilter({ title: 'uber' }).title, {
        $regex: 'uber',
        $options: 'i',
      });
    });

    it('escapa os metacaracteres — sem isso um "(" derruba a query', () => {
      const { $regex } = buildPurchaseFilter({ title: 'MERCADO (SP)' }).title as {
        $regex: string;
      };
      assert.equal($regex, 'MERCADO \\(SP\\)');
      assert.doesNotThrow(() => new RegExp($regex));
    });
  });
});
