import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import { buildPurchaseFilter } from './purchase-filter';

// Local, e não importado de `testing/mongo`: este arquivo testa uma função pura
// e não sobe banco nenhum — puxar aquele módulo arrastaria o mongodb-memory-server
// junto só por causa de uma constante.
const USUARIO = new Types.ObjectId();

/** Lê os limites de um filtro de intervalo como ISO, pra asserção legível. */
function range(value: unknown): { gte: string; lt: string } {
  const { $gte, $lt } = value as { $gte: Date; $lt: Date };
  return { gte: $gte.toISOString(), lt: $lt.toISOString() };
}

describe('buildPurchaseFilter', () => {
  // Sem isto, a listagem devolveria as compras de todos os usuários — e a tela
  // não teria como perceber, porque o formato da resposta seria o mesmo.
  it('recorta pelo dono, sempre', () => {
    assert.equal(buildPurchaseFilter(USUARIO, {}).userId, USUARIO);
    assert.equal(buildPurchaseFilter(USUARIO, { title: 'uber' }).userId, USUARIO);
  });

  // Os dois que ficam fora do total das faturas precisam ficar fora daqui também,
  // senão as duas telas mostram números diferentes para o mesmo mês.
  it('exclui pagamentos e encargos por padrão', () => {
    assert.deepEqual(buildPurchaseFilter(USUARIO, {}).category, { $nin: ['payment', 'encargos'] });
  });

  // Encargo é olhável de perto; pagamento, não. `?category=encargos` é como o
  // usuário chega a juros e multa sem que eles voltem para o total por acidente.
  it('deixa pedir encargos explicitamente, mas nunca pagamento', () => {
    assert.deepEqual(buildPurchaseFilter(USUARIO, { category: 'encargos' }).category, {
      $in: ['encargos'],
    });
    assert.deepEqual(buildPurchaseFilter(USUARIO, { category: 'payment,encargos' }).category, {
      $in: ['encargos'],
    });
  });

  // Regressão: um `amount: { $gt: 0 }` escondia os estornos aqui, enquanto o
  // /purchase/bill os somava — os dois endpoints discordavam do total do mês.
  it('não corta por valor, para os estornos aparecerem', () => {
    assert.equal(buildPurchaseFilter(USUARIO, {}).amount, undefined);
  });

  describe('filtro por data da compra', () => {
    it('cobre o mês inteiro em UTC, independente do fuso da máquina', () => {
      assert.deepEqual(range(buildPurchaseFilter(USUARIO, { date: '2025-03-15' }).date), {
        gte: '2025-03-01T00:00:00.000Z',
        lt: '2025-04-01T00:00:00.000Z',
      });
    });

    // Regressão: os limites eram montados com `new Date(ano, mês, dia)`, em
    // horário local. Em UTC-3 o início virava 2025-03-01T03:00Z e a compra
    // gravada em 2025-03-01T00:00Z ficava de fora — sumia uma compra por mês.
    it('inclui a compra do dia 1º, gravada à meia-noite UTC', () => {
      const { $gte } = buildPurchaseFilter(USUARIO, { date: '2025-03-15' }).date as { $gte: Date };
      assert.ok(new Date('2025-03-01T00:00:00.000Z') >= $gte);
    });

    // Regressão: `date=2025-03-01` devolvia fevereiro inteiro, porque a data
    // era parseada como UTC e depois lida em local, recuando um dia.
    it('não escorrega para o mês anterior quando o dia informado é o 1º', () => {
      assert.deepEqual(range(buildPurchaseFilter(USUARIO, { date: '2025-03-01' }).date), {
        gte: '2025-03-01T00:00:00.000Z',
        lt: '2025-04-01T00:00:00.000Z',
      });
    });

    it('vira o ano corretamente em dezembro', () => {
      assert.deepEqual(range(buildPurchaseFilter(USUARIO, { date: '2025-12-20' }).date), {
        gte: '2025-12-01T00:00:00.000Z',
        lt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('filtro por mês da fatura', () => {
    it('casa com o primeiro dia do mês em UTC, como o extractor grava', () => {
      const query = buildPurchaseFilter(USUARIO, { month: '2025-03' });
      assert.equal((query.referenceMonth as Date).toISOString(), '2025-03-01T00:00:00.000Z');
    });

    it('é independente do filtro por data da compra', () => {
      const query = buildPurchaseFilter(USUARIO, { month: '2025-03', date: '2025-02-28' });
      assert.equal((query.referenceMonth as Date).toISOString(), '2025-03-01T00:00:00.000Z');
      assert.deepEqual(range(query.date), {
        gte: '2025-02-01T00:00:00.000Z',
        lt: '2025-03-01T00:00:00.000Z',
      });
    });
  });

  describe('filtro por categoria', () => {
    it('aceita várias categorias separadas por vírgula, ignorando espaços', () => {
      const query = buildPurchaseFilter(USUARIO, { category: 'supermercado, transporte' });
      assert.deepEqual(query.category, { $in: ['supermercado', 'transporte'] });
    });

    // Regressão: escolher categorias substituía o `$ne: payment`, então
    // `?category=payment` devolvia os pagamentos que o endpoint promete ocultar.
    it('não deixa os pagamentos vazarem via ?category=payment', () => {
      assert.deepEqual(buildPurchaseFilter(USUARIO, { category: 'payment' }).category, { $in: [] });
      assert.deepEqual(buildPurchaseFilter(USUARIO, { category: 'payment,transporte' }).category, {
        $in: ['transporte'],
      });
    });
  });

  describe('busca por título', () => {
    it('busca parcial, sem diferenciar maiúsculas', () => {
      assert.deepEqual(buildPurchaseFilter(USUARIO, { title: 'uber' }).title, {
        $regex: 'uber',
        $options: 'i',
      });
    });

    it('escapa os metacaracteres — sem isso um "(" derruba a query', () => {
      const { $regex } = buildPurchaseFilter(USUARIO, { title: 'MERCADO (SP)' }).title as {
        $regex: string;
      };
      assert.equal($regex, 'MERCADO \\(SP\\)');
      assert.doesNotThrow(() => new RegExp($regex));
    });
  });
});
