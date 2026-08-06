import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { purchase, startTestDb, USUARIO, type TestDb } from '../testing/mongo';
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

      const { total, sum, average } = await service.listPurchases(USUARIO, {});

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

      const { total, sum } = await service.listPurchases(USUARIO, {});

      assert.equal(total, 1);
      assert.equal(sum, 30);
    });

    it('deixa o estorno entrar, negativo, para o total fechar com o das faturas', async () => {
      await db.purchases.create([
        purchase('Shopee', 'compras', { amount: 100 }),
        purchase('Estorno de Shopee', 'estorno', { amount: -30 }),
      ]);

      assert.equal((await service.listPurchases(USUARIO, {})).sum, 70);
    });

    it('deixa pedir encargo de propósito, mas nunca o pagamento', async () => {
      await db.purchases.create([
        purchase('Saldo em atraso', 'encargos', { amount: 1000 }),
        purchase('Pagamento recebido', 'payment', { amount: -500 }),
      ]);

      assert.equal((await service.listPurchases(USUARIO, { category: 'encargos' })).total, 1);
      assert.equal((await service.listPurchases(USUARIO, { category: 'payment' })).total, 0);
    });

    // Título de fatura é cheio de `*` e `+`. Sem escapar, `Mercadolivre*Mercadol`
    // viraria "Mercadoliv" seguido de qualquer coisa — e `(` derrubaria a query.
    it('busca título literalmente, sem tratar os símbolos como regex', async () => {
      await db.purchases.create([
        purchase('Mercadolivre*Mercadol', 'compras'),
        purchase('Mercadolivreeee', 'compras'),
      ]);

      const achados = await service.listPurchases(USUARIO, { title: 'Mercadolivre*Mercadol' });

      assert.equal(achados.total, 1);
      assert.equal(achados.purchases[0].title, 'Mercadolivre*Mercadol');
    });

    it('não quebra com parêntese na busca', async () => {
      await db.purchases.create([purchase('Loja (matriz)', 'compras')]);
      assert.equal((await service.listPurchases(USUARIO, { title: 'Loja (matriz)' })).total, 1);
    });

    it('acha o título independentemente da caixa', async () => {
      await db.purchases.create([purchase('MERCADOLIVRE', 'compras')]);
      assert.equal((await service.listPurchases(USUARIO, { title: 'mercadolivre' })).total, 1);
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

      assert.equal((await service.listPurchases(USUARIO, { month: '2026-03' })).total, 1);
      assert.equal((await service.listPurchases(USUARIO, { month: '2026-02' })).total, 0);
      assert.equal((await service.listPurchases(USUARIO, { date: '2026-02' })).total, 1);
      assert.equal((await service.listPurchases(USUARIO, { date: '2026-03' })).total, 0);
    });

    it('devolve zeros, e não NaN, quando nada casa', async () => {
      const vazio = await service.listPurchases(USUARIO, { title: 'não existe' });

      assert.deepEqual(vazio.purchases, []);
      assert.equal(vazio.total, 0);
      assert.equal(vazio.sum, 0);
      assert.equal(vazio.average, 0);
      assert.deepEqual(vazio.byMonth, []);
      assert.deepEqual(vazio.byCategory, []);
    });
  });

  /*
   * A divisão que a paginação no servidor introduz: `purchases` é a página, e
   * todo o resto descreve o filtro inteiro. Confundir os dois é um erro sem
   * sintoma — a tela mostraria a soma de cinquenta linhas chamando-a de total.
   */
  describe('paginação', () => {
    beforeEach(async () => {
      await db.purchases.create(
        Array.from({ length: 120 }, (_, i) =>
          purchase(`Compra ${String(i).padStart(3, '0')}`, 'compras', {
            amount: 10,
            date: new Date(Date.UTC(2026, 0, 1 + (i % 28))),
          }),
        ),
      );
    });

    it('devolve só a página pedida', async () => {
      const primeira = await service.listPurchases(USUARIO, { page: 1, limit: 50 });

      assert.equal(primeira.purchases.length, 50);
      assert.equal(primeira.page, 1);
      assert.equal(primeira.pageCount, 3);
    });

    it('mantém os agregados sobre o filtro inteiro, não sobre a página', async () => {
      const pagina = await service.listPurchases(USUARIO, { page: 2, limit: 10 });

      assert.equal(pagina.purchases.length, 10);
      // 120 compras de R$ 10 — os números não são os da página.
      assert.equal(pagina.total, 120);
      assert.equal(pagina.sum, 1200);
      assert.equal(pagina.average, 10);
    });

    it('a última página traz o resto', async () => {
      const ultima = await service.listPurchases(USUARIO, { page: 3, limit: 50 });
      assert.equal(ultima.purchases.length, 20);
    });

    it('página além do fim vem vazia, sem quebrar', async () => {
      const alem = await service.listPurchases(USUARIO, { page: 99, limit: 50 });

      assert.deepEqual(alem.purchases, []);
      assert.equal(alem.total, 120);
    });

    /*
     * O teste que justifica o desempate por `_id`. Todas as 120 compras têm o
     * mesmo valor, então ordenar por `amount` empata tudo. Sem critério estável,
     * o Mongo pode devolver a mesma compra em duas páginas e nenhuma vez outra.
     */
    it('não repete nem perde linha entre páginas, mesmo com tudo empatado', async () => {
      const vistos: string[] = [];
      for (let page = 1; page <= 3; page++) {
        const { purchases } = await service.listPurchases(USUARIO, {
          page,
          limit: 50,
          sort: 'amount',
          order: 'desc',
        });
        vistos.push(...purchases.map((p) => String(p._id)));
      }

      assert.equal(vistos.length, 120);
      assert.equal(new Set(vistos).size, 120, 'houve id repetido entre páginas');
    });

    it('prende o limite ao teto', async () => {
      const { limit } = await service.listPurchases(USUARIO, { limit: 999_999 });
      assert.equal(limit, 250);
    });
  });

  describe('ordenação no servidor', () => {
    beforeEach(async () => {
      await db.purchases.create([
        purchase('Cachorro', 'pet', { amount: 30, date: new Date('2026-03-01T00:00:00.000Z') }),
        purchase('Abacaxi', 'feira', { amount: 10, date: new Date('2026-01-01T00:00:00.000Z') }),
        purchase('Bicicleta', 'lazer', { amount: 20, date: new Date('2026-02-01T00:00:00.000Z') }),
      ]);
    });

    const titulos = (r: { purchases: Array<{ title: string }> }) => r.purchases.map((p) => p.title);

    it('ordena por título nos dois sentidos', async () => {
      assert.deepEqual(
        titulos(await service.listPurchases(USUARIO, { sort: 'title', order: 'asc' })),
        ['Abacaxi', 'Bicicleta', 'Cachorro'],
      );
      assert.deepEqual(
        titulos(await service.listPurchases(USUARIO, { sort: 'title', order: 'desc' })),
        ['Cachorro', 'Bicicleta', 'Abacaxi'],
      );
    });

    it('ordena por valor', async () => {
      assert.deepEqual(
        titulos(await service.listPurchases(USUARIO, { sort: 'amount', order: 'desc' })),
        ['Cachorro', 'Bicicleta', 'Abacaxi'],
      );
    });

    // A tela abre em "o que aconteceu agora", não em 2018.
    it('abre pelo mais recente quando ninguém pede ordem', async () => {
      assert.deepEqual(titulos(await service.listPurchases(USUARIO, {})), [
        'Cachorro',
        'Bicicleta',
        'Abacaxi',
      ]);
    });
  });

  /*
   * Os painéis da tela de Compras liam isto do conjunto inteiro enquanto a API
   * mandava tudo. Com paginação eles precisam vir do servidor, senão passariam a
   * descrever a página aberta.
   */
  describe('agregados dos painéis', () => {
    beforeEach(async () => {
      await db.purchases.create([
        purchase('Uber', 'transporte', { amount: 30, date: new Date('2026-01-10T00:00:00.000Z') }),
        purchase('99app', 'transporte', { amount: 20, date: new Date('2026-02-10T00:00:00.000Z') }),
        purchase('Padaria', 'restaurante', {
          amount: 50,
          date: new Date('2026-02-20T00:00:00.000Z'),
        }),
      ]);
    });

    it('agrupa por mês da compra, com uma página de uma linha só', async () => {
      const { byMonth, purchases } = await service.listPurchases(USUARIO, { page: 1, limit: 1 });

      assert.equal(purchases.length, 1);
      assert.deepEqual(byMonth, [
        { month: '2026-01', total: 30, count: 1 },
        { month: '2026-02', total: 70, count: 2 },
      ]);
    });

    // As duas categorias somam exatamente R$ 50 — o empate é de propósito, e
    // prende o desempate por nome. Sem ele o painel troca a ordem sozinho entre
    // uma requisição e outra, o que ninguém reporta como bug mas incomoda.
    it('agrupa por categoria, da maior para a menor, desempatando pelo nome', async () => {
      const { byCategory } = await service.listPurchases(USUARIO, { page: 1, limit: 1 });

      assert.deepEqual(
        byCategory.map((c) => [c.categoryByMonth, c.totalCategory, c.frequency]),
        [
          ['restaurante', 50, 1],
          ['transporte', 50, 2],
        ],
      );
      assert.equal(byCategory[0].percentage, 50);
    });

    /*
     * Regressão que veio do cliente junto com a agregação. A chave do mês era
     * montada em horário local sobre datas em UTC: em UTC-3, toda compra do dia
     * 1º caía no mês anterior e o gráfico abria com uma barra fantasma. Agora
     * quem monta a chave é o `$dateToString`, e o `timezone: 'UTC'` é o que
     * impede o mesmo erro do lado do servidor — os testes rodam em
     * America/Sao_Paulo justamente para que isso apareça.
     */
    it('mantém a compra do dia 1º no próprio mês, não no anterior', async () => {
      await db.purchases.deleteMany({});
      await db.purchases.create([
        purchase('Virada', 'compras', { date: new Date('2026-02-01T00:00:00.000Z') }),
      ]);

      const { byMonth } = await service.listPurchases(USUARIO, {});

      assert.deepEqual(
        byMonth.map((p) => p.month),
        ['2026-02'],
      );
    });

    it('respeita o filtro nos agregados', async () => {
      const { byCategory, total } = await service.listPurchases(USUARIO, {
        category: 'transporte',
      });

      assert.equal(total, 2);
      assert.deepEqual(
        byCategory.map((c) => c.categoryByMonth),
        ['transporte'],
      );
    });
  });

  describe('listUncategorized', () => {
    it('agrupa só o que está em outros, do que mais pesa para o que menos pesa', async () => {
      await db.purchases.create([
        purchase('Loja Cara', 'outros', { amount: 500 }),
        purchase('Loja Barata', 'outros', { amount: 10 }),
        purchase('Uber', 'transporte', { amount: 900 }),
      ]);

      const grupos = await service.listUncategorized(USUARIO);

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

      const [fatura] = await service.listBills(USUARIO);

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

      const [assinatura] = await service.listRecurring(USUARIO);

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
      const [semNome] = await service.listRecurring(USUARIO);
      assert.equal(semNome.name, null);

      await service.nameSubscription(USUARIO, { key: semNome.key, name: 'Meli+' });
      const [comNome] = await service.listRecurring(USUARIO);

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

      assert.deepEqual(await service.listRecurring(USUARIO), []);
    });
  });

  describe('nome da assinatura', () => {
    it('rebatizar sobrescreve em vez de empilhar um segundo nome', async () => {
      await service.nameSubscription(USUARIO, { key: 'spotify', name: 'Spotify' });
      await service.nameSubscription(USUARIO, { key: 'spotify', name: 'Spotify Família' });

      assert.equal(await db.subscriptions.countDocuments({ key: 'spotify' }), 1);
      assert.equal((await db.subscriptions.findOne().exec())?.name, 'Spotify Família');
    });

    // A detecção precisa de seis meses de série, e uma assinatura pode sair da
    // lista por um tempo. Exigir que a chave exista hoje perderia o apelido de
    // quem cancelou e voltou.
    it('aceita batizar chave que a detecção não devolve hoje', async () => {
      await service.nameSubscription(USUARIO, { key: 'nunca-detectada', name: 'Alguma coisa' });
      assert.equal(await db.subscriptions.countDocuments(), 1);
    });

    it('remover devolve a assinatura ao título do cartão', async () => {
      await service.nameSubscription(USUARIO, { key: 'spotify', name: 'Spotify' });
      await service.clearSubscriptionName(USUARIO, 'spotify');

      assert.equal(await db.subscriptions.countDocuments(), 0);
    });

    it('recusa remover nome que não existe', async () => {
      await assert.rejects(
        () => service.clearSubscriptionName(USUARIO, 'fantasma'),
        /não tem nome formal/,
      );
    });
  });
});
