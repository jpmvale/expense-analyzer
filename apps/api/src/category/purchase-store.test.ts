import { PAYMENT_CATEGORY, type PurchaseStore } from '@expense/categorization';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { purchase, startTestDb, type TestDb } from '../testing/mongo';
import { createPurchaseStore } from './purchase-store';

describe('createPurchaseStore', () => {
  let db: TestDb;
  let store: PurchaseStore;

  before(async () => {
    db = await startTestDb();
    store = createPurchaseStore(db.purchases);
  });

  after(async () => db.stop());
  beforeEach(async () => db.clear());

  it('lista os títulos distintos, inclusive os que nenhuma regra alcança', async () => {
    await db.purchases.create([
      purchase('Uber', 'transporte'),
      purchase('Uber', 'transporte'),
      purchase('Padaria', 'outros'),
    ]);

    assert.deepEqual((await store.distinctTitles()).sort(), ['Padaria', 'Uber']);
  });

  it('carimba a categoria e devolve quantas mudaram', async () => {
    await db.purchases.create([purchase('Uber', 'outros'), purchase('Uber', 'outros')]);

    assert.equal(await store.setCategoryForTitles(['Uber'], 'transporte'), 2);
    assert.equal(await db.purchases.countDocuments({ category: 'transporte' }), 2);
    // `sourceCategory` não se mexe: é para onde a compra volta se a regra sumir.
    assert.equal(await db.purchases.countDocuments({ sourceCategory: 'outros' }), 2);
  });

  /*
   * O contrato do `PurchaseStore` manda proteger o pagamento da fatura por
   * documento, e não por título — o mesmo título pode ser uma compra num mês e o
   * pagamento no seguinte. Se a proteção fosse por título, uma regra arrastaria a
   * fatura inteira para dentro do gasto.
   */
  describe('proteção do pagamento da fatura', () => {
    beforeEach(async () => {
      await db.purchases.create([
        purchase('Pagamento recebido', PAYMENT_CATEGORY),
        purchase('Pagamento recebido', 'outros'),
      ]);
    });

    it('esconde o pagamento da lista de títulos', async () => {
      // O título aparece porque existe uma compra com ele; o que não pode é a
      // linha do pagamento entrar.
      assert.deepEqual(await store.distinctTitles(), ['Pagamento recebido']);
    });

    it('não carimba a linha do pagamento, mesmo com o título casando', async () => {
      assert.equal(await store.setCategoryForTitles(['Pagamento recebido'], 'renda'), 1);

      assert.equal(await db.purchases.countDocuments({ category: PAYMENT_CATEGORY }), 1);
      assert.equal(await db.purchases.countDocuments({ category: 'renda' }), 1);
    });

    it('não devolve a linha do pagamento na restauração', async () => {
      await db.purchases.updateMany({}, { $set: { category: 'renda' } });

      assert.equal(await store.restoreSourceCategory(['Pagamento recebido']), 1);
      // A linha do pagamento continua onde a atualização crua a deixou: o store
      // não a tocou nem para desfazer.
      assert.equal(await db.purchases.countDocuments({ category: 'renda' }), 1);
      assert.equal(await db.purchases.countDocuments({ category: 'outros' }), 1);
    });
  });

  /*
   * A restauração grava com pipeline de agregação — `{ $set: { category:
   * '$sourceCategory' } }` —, que copia campo para campo dentro do servidor. É
   * exatamente o que um Model dublado não executaria: com um mock, o teste
   * passaria gravando a string literal "$sourceCategory".
   */
  it('devolve cada compra à categoria que a ingestão resolveu, uma a uma', async () => {
    await db.purchases.create([
      purchase('Uber', 'transporte'),
      purchase('Padaria', 'restaurante'),
    ]);
    await db.purchases.updateMany({}, { $set: { category: 'tudo errado' } });

    assert.equal(await store.restoreSourceCategory(['Uber', 'Padaria']), 2);

    const restauradas = await db.purchases.find().sort('title').exec();
    assert.deepEqual(
      restauradas.map((p) => [p.title, p.category]),
      [
        ['Padaria', 'restaurante'],
        ['Uber', 'transporte'],
      ],
    );
  });

  it('não conta como mudança quem já estava na categoria', async () => {
    await db.purchases.create([purchase('Uber', 'transporte')]);
    assert.equal(await store.setCategoryForTitles(['Uber'], 'transporte'), 0);
  });

  it('acha os títulos que a ingestão resolveu para uma categoria', async () => {
    await db.purchases.create([
      purchase('Saldo em atraso', 'encargos'),
      // Já reclassificada por uma regra: `category` mudou, `sourceCategory` não.
      purchase('Anuidade', 'academia', { sourceCategory: 'encargos' }),
      purchase('Uber', 'transporte'),
    ]);

    assert.deepEqual((await store.titlesWithSourceCategory('encargos')).sort(), [
      'Anuidade',
      'Saldo em atraso',
    ]);
  });
});
