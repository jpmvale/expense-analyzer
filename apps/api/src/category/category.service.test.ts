import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { purchase, startTestDb, type TestDb } from '../testing/mongo';
import { CategoryService } from './category.service';

/** A mensagem da exceção, que é o que a tela mostra ao usuário. */
async function recusa(action: Promise<unknown>): Promise<string> {
  try {
    await action;
  } catch (cause) {
    return (cause as Error).message;
  }
  throw new Error('esperava uma recusa, e a operação passou');
}

describe('CategoryService', () => {
  let db: TestDb;
  let service: CategoryService;

  before(async () => {
    db = await startTestDb();
    service = new CategoryService(db.purchases, db.categories, db.rules);
  });

  after(async () => db.stop());
  beforeEach(async () => db.clear());

  describe('listCategories', () => {
    it('une o que veio da fatura com o que o usuário criou', async () => {
      await db.purchases.create([purchase('Uber', 'transporte')]);
      await db.categories.create({ name: 'viagem' });

      assert.deepEqual(await service.listCategories(), [
        { name: 'transporte', purchaseCount: 1 },
        { name: 'viagem', purchaseCount: 0 },
      ]);
    });

    it('deixa o pagamento da fatura de fora, que não é categoria', async () => {
      await db.purchases.create([
        purchase('Pagamento recebido', 'payment'),
        purchase('Uber', 'transporte'),
      ]);

      assert.deepEqual(
        (await service.listCategories()).map((c) => c.name),
        ['transporte'],
      );
    });
  });

  describe('createCategory', () => {
    it('recusa nome já existente, ainda que com outra caixa ou acento', async () => {
      await db.categories.create({ name: 'Saúde' });

      const erro = await recusa(service.createCategory({ name: 'saude' }));
      assert.match(erro, /"Saúde" já existe/);
    });

    it('recusa o pagamento da fatura como categoria', async () => {
      const erro = await recusa(service.createCategory({ name: 'payment' }));
      assert.match(erro, /pagamento da fatura/);
    });

    it('recusa nome vazio', async () => {
      assert.match(await recusa(service.createCategory({ name: '   ' })), /precisa de um nome/);
    });
  });

  describe('renameCategory', () => {
    it('renomeia as compras, a origem e as regras que apontavam para o nome antigo', async () => {
      await db.purchases.create([purchase('Uber', 'transporte')]);
      await db.rules.create({ kind: 'exact', value: 'Uber', category: 'transporte' });

      await service.renameCategory('transporte', { name: 'mobilidade' });

      const compra = await db.purchases.findOne().exec();
      // As duas pontas: mexer só em `category` faria a próxima reaplicação ler a
      // `sourceCategory` antiga e desfazer o trabalho na primeira regra que mudasse.
      assert.equal(compra?.category, 'mobilidade');
      assert.equal(compra?.sourceCategory, 'mobilidade');
      assert.equal((await db.rules.findOne().exec())?.category, 'mobilidade');
    });

    it('mescla quando o destino já existe, somando as compras', async () => {
      await db.purchases.create([
        purchase('Uber', 'transporte'),
        purchase('99app', 'mobilidade'),
      ]);

      const resultado = await service.renameCategory('transporte', { name: 'mobilidade' });

      assert.deepEqual(resultado, { name: 'mobilidade', purchaseCount: 2 });
      assert.equal(await db.purchases.countDocuments({ category: 'transporte' }), 0);
    });

    // Comparar normalizado engoliria esta renomeação em silêncio, deixando a
    // tela mostrando o nome antigo.
    it('trata troca de caixa como renomeação de verdade', async () => {
      await db.purchases.create([purchase('Ikea', 'casa')]);

      await service.renameCategory('casa', { name: 'Casa' });

      assert.equal((await db.purchases.findOne().exec())?.category, 'Casa');
    });

    it('não deixa registro órfão do nome antigo', async () => {
      await db.categories.create({ name: 'casa' });

      await service.renameCategory('casa', { name: 'lar' });

      assert.equal(await db.categories.countDocuments({ name: 'casa' }), 0);
      assert.equal(await db.categories.countDocuments({ name: 'lar' }), 1);
    });

    it('recusa categoria que não existe', async () => {
      assert.match(await recusa(service.renameCategory('fantasma', { name: 'x' })), /não encontrada/);
    });

    it('recusa renomear o pagamento da fatura', async () => {
      await db.purchases.create([purchase('Pagamento recebido', 'payment')]);
      assert.match(
        await recusa(service.renameCategory('payment', { name: 'renda' })),
        /não é uma categoria renomeável/,
      );
    });
  });

  describe('deleteCategory', () => {
    it('recusa apagar categoria em uso e diz quantas compras a seguram', async () => {
      await db.categories.create({ name: 'casa' });
      await db.purchases.create([purchase('Ikea', 'casa'), purchase('Leroy', 'casa')]);

      const erro = await recusa(service.deleteCategory('casa'));
      assert.match(erro, /tem 2 compras/);
      assert.equal(await db.categories.countDocuments({ name: 'casa' }), 1);
    });

    it('recusa apagar categoria que ainda é destino de regra', async () => {
      await db.categories.create({ name: 'casa' });
      await db.rules.create({ kind: 'exact', value: 'Ikea', category: 'casa' });

      assert.match(await recusa(service.deleteCategory('casa')), /destino de 1 regras/);
    });

    it('apaga a que não está em uso', async () => {
      await db.categories.create({ name: 'casa' });
      await service.deleteCategory('casa');
      assert.equal(await db.categories.countDocuments(), 0);
    });
  });

  describe('upsertRule', () => {
    it('classifica as compras do título e devolve quantas mudaram', async () => {
      await db.purchases.create([purchase('Ikea', 'outros'), purchase('Ikea', 'outros')]);

      const { classified } = await service.upsertRule({
        kind: 'exact',
        value: 'Ikea',
        category: 'casa',
      });

      assert.equal(classified, 2);
      assert.equal(await db.purchases.countDocuments({ category: 'casa' }), 2);
    });

    // Duas regras para o mesmo valor só se contradiriam, e o desempate por data
    // faria a antiga virar lixo silencioso.
    it('edita a regra existente em vez de empilhar uma segunda', async () => {
      await db.purchases.create([purchase('IKEA', 'outros')]);

      await service.upsertRule({ kind: 'exact', value: 'IKEA', category: 'casa' });
      // Mesmo valor com outra caixa: é a mesma regra.
      await service.upsertRule({ kind: 'exact', value: 'ikea', category: 'móveis' });

      assert.equal(await db.rules.countDocuments(), 1);
      assert.equal((await db.rules.findOne().exec())?.category, 'móveis');
      assert.equal((await db.purchases.findOne().exec())?.category, 'móveis');
    });

    it('faz a categoria da regra existir antes de qualquer compra cair nela', async () => {
      await service.upsertRule({ kind: 'contains', value: 'zzz', category: 'inédita' });
      assert.equal(await db.categories.countDocuments({ name: 'inédita' }), 1);
    });

    it('recusa regra apontando para o pagamento da fatura', async () => {
      const erro = await recusa(
        service.upsertRule({ kind: 'exact', value: 'Uber', category: 'payment' }),
      );
      assert.match(erro, /somaria a fatura ao gasto/);
    });
  });

  describe('deleteRule', () => {
    it('devolve as compras à categoria que a ingestão tinha resolvido', async () => {
      await db.purchases.create([purchase('Ikea', 'outros')]);
      const { rule } = await service.upsertRule({
        kind: 'exact',
        value: 'Ikea',
        category: 'casa',
      });

      const { restored } = await service.deleteRule(String(rule._id));

      assert.equal(restored, 1);
      assert.equal((await db.purchases.findOne().exec())?.category, 'outros');
    });

    it('recusa id que não existe', async () => {
      assert.match(
        await recusa(service.deleteRule('64b7f1c2a1b2c3d4e5f60718')),
        /Regra não encontrada/,
      );
    });
  });

  /*
   * A camada de encargo é a única inferência por título que a reaplicação
   * redecide em vez de herdar de `sourceCategory` — porque é a única que muda
   * QUANTO se gastou, e não apenas como o gasto se reparte. Foi validada à mão
   * contra cópias da base real; aqui ela fica presa nos dois sentidos.
   */
  describe('reapply e a camada de encargo', () => {
    it('manda para encargos o que a lista de agora reconhece, contra a ingestão', async () => {
      await db.purchases.create([purchase('Juros de dívida encerrada', 'outros')]);

      const { financing } = await service.reapply();

      assert.equal(financing, 1);
      assert.equal((await db.purchases.findOne().exec())?.category, 'encargos');
    });

    it('tira de encargos o que a lista não reconhece mais, refazendo a inferência', async () => {
      // A ingestão gravou `encargos` com uma lista antiga; a de hoje não vê
      // encargo nenhum neste título, e ele é claramente transporte.
      await db.purchases.create([
        purchase('Uber viagem', 'encargos', { sourceCategory: 'encargos' }),
      ]);

      const { financing } = await service.reapply();

      assert.equal(financing, 1);
      // Não volta para `sourceCategory`, que insistiria em `encargos`: refaz a
      // inferência pelo título, que é o que a ingestão faria hoje.
      assert.equal((await db.purchases.findOne().exec())?.category, 'transporte');
    });

    it('deixa a regra do usuário ganhar do encargo', async () => {
      await db.purchases.create([purchase('Anuidade Smart Fit', 'outros')]);

      await service.upsertRule({
        kind: 'contains',
        value: 'Anuidade Smart Fit',
        category: 'academia',
      });

      // Sem a regra isto seria `encargos` pela palavra `anuidade` — é o que
      // permite dizer que esta anuidade é mensalidade de academia.
      assert.equal((await db.purchases.findOne().exec())?.category, 'academia');
    });

    it('é idempotente: rodar de novo não escreve nada', async () => {
      await db.purchases.create([
        purchase('Juros de dívida encerrada', 'outros'),
        purchase('Uber', 'outros'),
      ]);

      await service.reapply();
      const segunda = await service.reapply();

      assert.deepEqual(segunda, { classified: 0, restored: 0, financing: 0 });
    });
  });

  describe('listRuleUsage', () => {
    it('conta as compras que cada regra governa', async () => {
      await db.purchases.create([
        purchase('Shopee *Alfa', 'outros'),
        purchase('Shopee *Alfa', 'outros'),
        purchase('Shopee *Beta', 'outros'),
      ]);
      await service.upsertRule({ kind: 'contains', value: 'shopee', category: 'Shopee' });

      const [uso] = await service.listRuleUsage();

      assert.equal(uso.value, 'shopee');
      assert.equal(uso.purchases, 3);
      assert.equal(uso.titles, 2);
    });

    // Contar por casamento diria que as duas governam a mesma compra, e apagar
    // a `contains` prometeria devolver algo que ela não manda.
    it('dá a compra a quem de fato manda nela, não a quem casa', async () => {
      await db.purchases.create([
        purchase('Shopee *Alfa', 'outros'),
        purchase('Shopee *Beta', 'outros'),
      ]);
      await service.upsertRule({ kind: 'contains', value: 'shopee', category: 'Shopee' });
      await service.upsertRule({ kind: 'exact', value: 'Shopee *Alfa', category: 'saúde' });

      const uso = await service.listRuleUsage();
      const trecho = uso.find((u) => u.kind === 'contains');
      const exata = uso.find((u) => u.kind === 'exact');

      assert.equal(exata?.purchases, 1);
      assert.equal(trecho?.purchases, 1);
    });

    it('mostra zero na regra que não alcança nada hoje', async () => {
      await db.purchases.create([purchase('Uber', 'transporte')]);
      await service.upsertRule({ kind: 'exact', value: 'Loja fechada', category: 'casa' });

      const [uso] = await service.listRuleUsage();
      assert.equal(uso.purchases, 0);
    });
  });

  describe('listConsolidations', () => {
    it('propõe o trecho que substitui as regras exact de um mesmo lugar', async () => {
      for (const sufixo of ['Alfa', 'Beta', 'Gama']) {
        await db.purchases.create([purchase(`Shopee *${sufixo}`, 'outros')]);
        await service.upsertRule({
          kind: 'exact',
          value: `Shopee *${sufixo}`,
          category: 'Shopee',
        });
      }

      const [sugestao] = await service.listConsolidations();

      assert.equal(sugestao.category, 'Shopee');
      assert.equal(sugestao.replaces.length, 3);
      assert.deepEqual(sugestao.conflicts, []);
    });

    // O caso que a base real trouxe: a Shopee é marketplace, e parte das compras
    // está classificada pelo que foi comprado. A sugestão precisa aparecer com o
    // preço dela, não desaparecer.
    it('devolve a bloqueada dizendo o que ela levaria junto', async () => {
      for (const sufixo of ['Alfa', 'Beta', 'Gama']) {
        await db.purchases.create([purchase(`Shopee *${sufixo}`, 'outros')]);
        await service.upsertRule({
          kind: 'exact',
          value: `Shopee *${sufixo}`,
          category: 'Shopee',
        });
      }
      // Classificada pela ingestão, sem regra própria: seria capturada.
      await db.purchases.create([purchase('Shopee *Drogaria', 'saúde')]);

      const bloqueada = (await service.listConsolidations()).find((s) => s.conflicts.length > 0);

      assert.ok(bloqueada);
      assert.deepEqual(bloqueada.conflicts, [{ title: 'Shopee *Drogaria', category: 'saúde' }]);
    });
  });

  describe('consolidate', () => {
    async function comTresRegras() {
      for (const sufixo of ['Alfa', 'Beta', 'Gama']) {
        await db.purchases.create([purchase(`Shopee *${sufixo}`, 'outros')]);
        await service.upsertRule({ kind: 'exact', value: `Shopee *${sufixo}`, category: 'Shopee' });
      }
    }

    it('troca as exact cobertas por uma contains, sem mudar a categoria de ninguém', async () => {
      await comTresRegras();

      const resultado = await service.consolidate({ value: 'shopee *', category: 'Shopee' });

      assert.equal(resultado.deleted, 3);
      const regras = await service.listRules();
      assert.equal(regras.length, 1);
      assert.equal(regras[0].kind, 'contains');

      const compras = await db.purchases.find().exec();
      assert.ok(compras.every((c) => c.category === 'Shopee'));
    });

    // A tela pode estar desatualizada; quem decide o que morre é o servidor, a
    // partir do trecho — nunca uma lista de ids vinda do cliente.
    it('não toca em regra de outra categoria nem no que o trecho não cobre', async () => {
      await comTresRegras();
      await service.upsertRule({ kind: 'exact', value: 'Shopee *Drogaria', category: 'saúde' });
      await service.upsertRule({ kind: 'exact', value: 'Uber', category: 'transporte' });

      await service.consolidate({ value: 'shopee *', category: 'Shopee' });

      const sobraram = (await service.listRules()).map((r) => r.value).sort();
      assert.deepEqual(sobraram, ['Shopee *Drogaria', 'Uber', 'shopee *']);
    });

    it('recusa trecho vazio', async () => {
      assert.match(
        await recusa(service.consolidate({ value: '   ', category: 'Shopee' })),
        /vazio/,
      );
    });
  });
});
