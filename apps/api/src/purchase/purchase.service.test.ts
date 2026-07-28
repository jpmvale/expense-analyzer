import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { purchase, startTestDb, type TestDb } from '../testing/mongo';
import { PurchaseService } from './purchase.service';

/**
 * O filtro em si já é testado sem banco em `purchase-filter.test.ts`. O que só o
 * Mongo prova é que o filtro montado devolve as linhas certas — em particular
 * que a busca por título sobrevive aos `*` e `+` que o emissor põe no meio dos
 * nomes, e que o recorte por mês de fatura não escorrega de fuso.
 */
describe('PurchaseService', () => {
  let db: TestDb;
  let service: PurchaseService;

  before(async () => {
    db = await startTestDb();
    service = new PurchaseService(db.purchases, db.subscriptions);
  });

  after(async () => db.stop());
  beforeEach(async () => db.clear());

  describe('listPurchases', () => {
    it('soma, conta e tira a média do que sobrou do filtro', async () => {
      await db.purchases.create([
        purchase('Uber', 'transporte', { amount: 30 }),
        purchase('Padaria', 'restaurante', { amount: 20 }),
      ]);

      const { total, sum, average } = await service.listPurchases({});

      assert.equal(total, 2);
      assert.equal(sum, 50);
      assert.equal(average, 25);
    });

    it('deixa pagamento e encargo fora do gasto', async () => {
      await db.purchases.create([
        purchase('Uber', 'transporte', { amount: 30 }),
        purchase('Pagamento recebido', 'payment', { amount: -500 }),
        purchase('Saldo em atraso', 'encargos', { amount: 1000 }),
      ]);

      const { total, sum } = await service.listPurchases({});

      assert.equal(total, 1);
      assert.equal(sum, 30);
    });

    it('deixa o estorno entrar, negativo, para o total fechar com o das faturas', async () => {
      await db.purchases.create([
        purchase('Shopee', 'compras', { amount: 100 }),
        purchase('Estorno de Shopee', 'estorno', { amount: -30 }),
      ]);

      assert.equal((await service.listPurchases({})).sum, 70);
    });

    it('deixa pedir encargo de propósito, mas nunca o pagamento', async () => {
      await db.purchases.create([
        purchase('Saldo em atraso', 'encargos', { amount: 1000 }),
        purchase('Pagamento recebido', 'payment', { amount: -500 }),
      ]);

      assert.equal((await service.listPurchases({ category: 'encargos' })).total, 1);
      assert.equal((await service.listPurchases({ category: 'payment' })).total, 0);
    });

    // Título de fatura é cheio de `*` e `+`. Sem escapar, `Mercadolivre*Mercadol`
    // viraria "Mercadoliv" seguido de qualquer coisa — e `(` derrubaria a query.
    it('busca título literalmente, sem tratar os símbolos como regex', async () => {
      await db.purchases.create([
        purchase('Mercadolivre*Mercadol', 'compras'),
        purchase('Mercadolivreeee', 'compras'),
      ]);

      const achados = await service.listPurchases({ title: 'Mercadolivre*Mercadol' });

      assert.equal(achados.total, 1);
      assert.equal(achados.purchases[0].title, 'Mercadolivre*Mercadol');
    });

    it('não quebra com parêntese na busca', async () => {
      await db.purchases.create([purchase('Loja (matriz)', 'compras')]);
      assert.equal((await service.listPurchases({ title: 'Loja (matriz)' })).total, 1);
    });

    it('acha o título independentemente da caixa', async () => {
      await db.purchases.create([purchase('MERCADOLIVRE', 'compras')]);
      assert.equal((await service.listPurchases({ title: 'mercadolivre' })).total, 1);
    });

    /*
     * O mês da fatura e a data da compra são coisas diferentes de propósito: uma
     * compra de 28/02 cai na fatura de março. Como as datas são gravadas em UTC e
     * os testes rodam em America/Sao_Paulo, montar o limite em horário local
     * engoliria o primeiro dia do mês — é o erro que este teste prende.
     */
    it('separa o mês da fatura da data da compra', async () => {
      await db.purchases.create([
        purchase('Compra de virada', 'compras', {
          date: new Date('2026-02-28T00:00:00.000Z'),
          referenceMonth: new Date('2026-03-01T00:00:00.000Z'),
        }),
      ]);

      assert.equal((await service.listPurchases({ month: '2026-03' })).total, 1);
      assert.equal((await service.listPurchases({ month: '2026-02' })).total, 0);
      assert.equal((await service.listPurchases({ date: '2026-02' })).total, 1);
      assert.equal((await service.listPurchases({ date: '2026-03' })).total, 0);
    });

    it('devolve zeros, e não NaN, quando nada casa', async () => {
      assert.deepEqual(await service.listPurchases({ title: 'não existe' }), {
        purchases: [],
        total: 0,
        sum: 0,
        average: 0,
      });
    });
  });

  describe('listUncategorized', () => {
    it('agrupa só o que está em outros, do que mais pesa para o que menos pesa', async () => {
      await db.purchases.create([
        purchase('Loja Cara', 'outros', { amount: 500 }),
        purchase('Loja Barata', 'outros', { amount: 10 }),
        purchase('Uber', 'transporte', { amount: 900 }),
      ]);

      const grupos = await service.listUncategorized();

      assert.deepEqual(
        grupos.map((g) => g.title),
        ['Loja Cara', 'Loja Barata'],
      );
    });
  });

  describe('listBills', () => {
    it('agrega por mês de referência e tira o encargo do total', async () => {
      await db.purchases.create([
        purchase('Uber', 'transporte', { amount: 100 }),
        purchase('Saldo em atraso', 'encargos', { amount: 1000 }),
      ]);

      const [fatura] = await service.listBills();

      assert.equal(fatura.total, 100);
      assert.equal(fatura.charges, 1000);
    });
  });

  describe('listRecurring', () => {
    it('acha a assinatura e o degrau atravessando as grafias do gateway', async () => {
      // Seis meses a R$ 19,90 sob um gateway, seis a R$ 23,90 sob outro.
      const meses = Array.from({ length: 12 }, (_, i) => {
        const antiga = i < 6;
        return purchase(antiga ? 'Ebanx *Spotify' : 'Dm *Spotify', 'serviços', {
          amount: antiga ? 19.9 : 23.9,
          date: new Date(Date.UTC(2025, i, 10)),
          referenceMonth: new Date(Date.UTC(2025, i, 1)),
        });
      });
      await db.purchases.create(meses);

      const [assinatura] = await service.listRecurring();

      assert.equal(assinatura.charges, 12);
      assert.equal(assinatura.current, 23.9);
      assert.equal(assinatura.previous, 19.9);
    });

    it('junta o apelido do usuário sem deixá-lo mexer na detecção', async () => {
      const meses = Array.from({ length: 8 }, (_, i) =>
        purchase('Mp *Melimais', 'serviços', {
          amount: 19.9,
          date: new Date(Date.UTC(2025, i, 10)),
          referenceMonth: new Date(Date.UTC(2025, i, 1)),
        }),
      );
      await db.purchases.create(meses);
      const [semNome] = await service.listRecurring();
      assert.equal(semNome.name, null);

      await service.nameSubscription({ key: semNome.key, name: 'Meli+' });
      const [comNome] = await service.listRecurring();

      assert.equal(comNome.name, 'Meli+');
      // O apelido é rótulo: não muda agrupamento, degrau nem título.
      assert.equal(comNome.title, semNome.title);
      assert.equal(comNome.charges, semNome.charges);
      assert.equal(comNome.current, semNome.current);
    });

    it('não olha pagamento nem encargo', async () => {
      const meses = Array.from({ length: 12 }, (_, i) =>
        purchase('Saldo em atraso', 'encargos', {
          amount: 500,
          date: new Date(Date.UTC(2025, i, 10)),
          referenceMonth: new Date(Date.UTC(2025, i, 1)),
        }),
      );
      await db.purchases.create(meses);

      assert.deepEqual(await service.listRecurring(), []);
    });
  });

  describe('nome da assinatura', () => {
    it('rebatizar sobrescreve em vez de empilhar um segundo nome', async () => {
      await service.nameSubscription({ key: 'spotify', name: 'Spotify' });
      await service.nameSubscription({ key: 'spotify', name: 'Spotify Família' });

      assert.equal(await db.subscriptions.countDocuments({ key: 'spotify' }), 1);
      assert.equal((await db.subscriptions.findOne().exec())?.name, 'Spotify Família');
    });

    // A detecção precisa de seis meses de série, e uma assinatura pode sair da
    // lista por um tempo. Exigir que a chave exista hoje perderia o apelido de
    // quem cancelou e voltou.
    it('aceita batizar chave que a detecção não devolve hoje', async () => {
      await service.nameSubscription({ key: 'nunca-detectada', name: 'Alguma coisa' });
      assert.equal(await db.subscriptions.countDocuments(), 1);
    });

    it('remover devolve a assinatura ao título do cartão', async () => {
      await service.nameSubscription({ key: 'spotify', name: 'Spotify' });
      await service.clearSubscriptionName('spotify');

      assert.equal(await db.subscriptions.countDocuments(), 0);
    });

    it('recusa remover nome que não existe', async () => {
      await assert.rejects(
        () => service.clearSubscriptionName('fantasma'),
        /não tem nome formal/,
      );
    });
  });
});
