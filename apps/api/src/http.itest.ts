// Sem `esModuleInterop`, um `import padrão` destes dois viraria `.default`,
// que nenhum dos dois tem sob `ts-node` — só `import = require` funciona aqui.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import assert = require('node:assert/strict');
import { after, before, describe, it } from 'node:test';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');
import {
  loginAgent,
  registerAgent,
  startTestApp,
  TEST_INVITE_CODE,
  type TestApp,
} from './testing/http';

/** Um CSV de uma fatura, para as rotas que precisam de dado de verdade. */
function csv(title: string, amount: number): Buffer {
  return Buffer.from(
    ['date,category,title,amount', `2026-03-10,transporte,${title},${amount}`].join('\n'),
  );
}

/**
 * A camada que os testes de serviço não cobrem: DI, guard de sessão,
 * `ValidationPipe`. `category.service.test.ts` chama o serviço direto pelo
 * construtor — prova a decisão, mas pula o Nest inteiro. Aqui sobe o
 * `AppModule` de verdade, contra Mongo em memória, e bate nas rotas por HTTP.
 */
describe('API HTTP', () => {
  let testApp: TestApp;

  before(async () => {
    testApp = await startTestApp();
  });

  after(async () => {
    await testApp.stop();
  });

  describe('SessionAuthGuard', () => {
    it('bloqueia rota protegida sem sessão', async () => {
      await request(testApp.server).get('/category').expect(401);
    });

    it('libera rota marcada @Public() sem sessão', async () => {
      const res = await request(testApp.server).get('/health').expect(200);
      assert.equal(res.body.status, 'ok');
    });

    it('libera /auth/session sem sessão, com authenticated: false', async () => {
      const res = await request(testApp.server).get('/auth/session').expect(200);
      assert.equal(res.body.authenticated, false);
    });
  });

  describe('cadastro', () => {
    it('recusa sem o código de convite certo', async () => {
      await request(testApp.server)
        .post('/auth/register')
        .send({
          username: 'invasor',
          email: 'invasor@teste.invalido',
          password: 'senha-comprida',
          inviteCode: 'chute',
        })
        .expect(403);

      // E a conta não nasce: o convite é checado antes de qualquer escrita.
      await request(testApp.server)
        .post('/auth/login')
        .send({ username: 'invasor', password: 'senha-comprida' })
        .expect(401);
    });

    it('recusa senha curta demais (ValidationPipe)', async () => {
      await request(testApp.server)
        .post('/auth/register')
        .send({
          username: 'curta',
          email: 'curta@teste.invalido',
          password: 'abc',
          inviteCode: TEST_INVITE_CODE,
        })
        .expect(400);
    });

    it('recusa cadastro sem e-mail, que é o caminho de volta da conta', async () => {
      await request(testApp.server)
        .post('/auth/register')
        .send({ username: 'sem-email', password: 'senha-comprida', inviteCode: TEST_INVITE_CODE })
        .expect(400);
    });

    it('cria a conta e já abre a sessão, sem passar pelo login', async () => {
      const agent = request.agent(testApp.server);
      const res = await agent
        .post('/auth/register')
        .send({
          username: 'recem-chegada',
          email: 'recem-chegada@teste.invalido',
          password: 'senha-comprida',
          inviteCode: TEST_INVITE_CODE,
        })
        .expect(201);

      assert.equal(res.body.authenticated, true);
      assert.equal(res.body.username, 'recem-chegada');
      assert.equal(res.body.email, 'recem-chegada@teste.invalido');
      await agent.get('/category').expect(200);
    });
  });

  describe('trocar a senha logado', () => {
    it('recusa com a senha atual errada', async () => {
      const agent = await registerAgent(testApp, 'troca-recusada');

      await agent
        .post('/auth/change-password')
        .send({ currentPassword: 'chute', newPassword: 'senha-nova-boa' })
        .expect(401);
    });

    it('exige sessão', async () => {
      await request(testApp.server)
        .post('/auth/change-password')
        .send({ currentPassword: 'qualquer', newPassword: 'senha-nova-boa' })
        .expect(401);
    });

    /**
     * A garantia que faz a troca valer: quem já estava dentro com a senha antiga
     * cai, e quem trocou continua. Sem a primeira metade, trocar a senha depois
     * de ela vazar não expulsa ninguém.
     */
    it('derruba a outra sessão da conta e mantém a de quem trocou', async () => {
      const senha = 'senha-de-teste-nao-e-a-real';
      const primeira = await registerAgent(testApp, 'duas-sessoes', senha);
      const segunda = request.agent(testApp.server);
      await segunda.post('/auth/login').send({ username: 'duas-sessoes', password: senha }).expect(201);

      await primeira
        .post('/auth/change-password')
        .send({ currentPassword: senha, newPassword: 'senha-nova-boa' })
        .expect(200);

      await primeira.get('/category').expect(200);
      await segunda.get('/category').expect(401);

      // E a senha nova é a que vale dali em diante.
      await request(testApp.server)
        .post('/auth/login')
        .send({ username: 'duas-sessoes', password: senha })
        .expect(401);
      await request(testApp.server)
        .post('/auth/login')
        .send({ username: 'duas-sessoes', password: 'senha-nova-boa' })
        .expect(201);
    });
  });

  describe('esqueci minha senha', () => {
    /** O token de dentro do link — o banco só tem o hash dele. */
    function tokenDoUltimoEmail(): string {
      const ultimo = testApp.emails.at(-1);
      const match = ultimo?.text.match(/redefinir\?token=([A-Za-z0-9_-]+)/);
      if (!match) throw new Error('o último e-mail não trouxe link de redefinição');
      return match[1];
    }

    /**
     * A defesa contra enumeração: a resposta é a mesma para endereço com e sem
     * conta. Se diferisse, um laço sobre uma lista de e-mails revelaria quem tem
     * conta nesta instância.
     */
    it('responde 204 para e-mail que não é de ninguém, e não manda nada', async () => {
      const antes = testApp.emails.length;

      await request(testApp.server)
        .post('/auth/forgot-password')
        .send({ email: 'ninguem@teste.invalido' })
        .expect(204);

      assert.equal(testApp.emails.length, antes);
    });

    it('vai do link do e-mail até entrar com a senha nova', async () => {
      await registerAgent(testApp, 'esquecida');

      await request(testApp.server)
        .post('/auth/forgot-password')
        .send({ email: 'esquecida@teste.invalido' })
        .expect(204);

      const token = tokenDoUltimoEmail();
      await request(testApp.server)
        .post('/auth/reset-password')
        .send({ token, newPassword: 'senha-redefinida' })
        .expect(204);

      await request(testApp.server)
        .post('/auth/login')
        .send({ username: 'esquecida', password: 'senha-redefinida' })
        .expect(201);

      // E o mesmo link não serve duas vezes.
      await request(testApp.server)
        .post('/auth/reset-password')
        .send({ token, newPassword: 'mais-uma-senha' })
        .expect(400);
    });

    it('recusa token inventado', async () => {
      await request(testApp.server)
        .post('/auth/reset-password')
        .send({ token: 'nao-existe', newPassword: 'senha-redefinida' })
        .expect(400);
    });
  });

  describe('login', () => {
    it('recusa credenciais erradas', async () => {
      await request(testApp.server)
        .post('/auth/login')
        .send({ username: testApp.credentials.username, password: 'senha-errada' })
        .expect(401);
    });

    it('aceita credenciais corretas e abre sessão', async () => {
      await loginAgent(testApp); // garante que a conta dona existe

      const agent = request.agent(testApp.server);
      const res = await agent.post('/auth/login').send(testApp.credentials).expect(201);
      assert.equal(res.body.username, testApp.credentials.username);

      const session = await agent.get('/auth/session').expect(200);
      assert.equal(session.body.authenticated, true);
      assert.equal(session.body.isOwner, true);
    });

    it('libera rota protegida depois do login, e derruba depois do logout', async () => {
      const agent = await loginAgent(testApp);
      await agent.get('/category').expect(200);

      await agent.post('/auth/logout').expect(204);
      await agent.get('/category').expect(401);
    });
  });

  describe('ValidationPipe', () => {
    it('rejeita corpo sem os campos obrigatórios', async () => {
      await request(testApp.server).post('/auth/login').send({}).expect(400);
    });

    it('rejeita campo desconhecido no corpo (forbidNonWhitelisted)', async () => {
      await request(testApp.server)
        .post('/auth/login')
        .send({ ...testApp.credentials, admin: true })
        .expect(400);
    });
  });

  describe('DI e rotas, autenticado', () => {
    it('resolve CategoryController e devolve a lista de categorias', async () => {
      const agent = await loginAgent(testApp);
      const res = await agent.get('/category').expect(200);
      assert.ok(Array.isArray(res.body));
    });

    it('resolve CategoryRuleController e devolve a lista de regras', async () => {
      const agent = await loginAgent(testApp);
      const res = await agent.get('/category-rule').expect(200);
      assert.ok(Array.isArray(res.body));
    });

    it('resolve PurchaseController e devolve uma página vazia', async () => {
      const agent = await loginAgent(testApp);
      const res = await agent.get('/purchase').expect(200);
      assert.ok(res.body);
    });
  });

  describe('o Drive é só da conta dona', () => {
    it('responde /sync para o dono', async () => {
      const dono = await loginAgent(testApp);
      await dono.get('/sync').expect(200);
    });

    it('recusa /sync para quem não é dono, na leitura e na escrita', async () => {
      const outra = await registerAgent(testApp, 'sem-drive');

      await outra.get('/sync').expect(403);
      await outra.post('/sync').expect(403);

      const session = await outra.get('/auth/session').expect(200);
      assert.equal(session.body.isOwner, false);
    });
  });

  /**
   * O teste que justifica a leva inteira.
   *
   * Vazamento entre contas não tem sintoma: a resposta tem o formato certo, o
   * status é 200, e a tela mostra números plausíveis — só que de outra pessoa.
   * Nenhum teste de serviço pega isso, porque cada um roda com um usuário só.
   * Aqui duas contas escrevem na mesma base, ao mesmo tempo, e cada rota é
   * conferida contra o que a vizinha gravou.
   */
  describe('isolamento entre contas', () => {
    it('nenhuma rota mostra, edita ou apaga o dado da outra conta', async () => {
      const ana = await registerAgent(testApp, 'ana-isolada');
      const bia = await registerAgent(testApp, 'bia-isolada');

      // Cada uma sobe a própria fatura, com títulos que não se confundem.
      await ana
        .post('/import')
        .attach('files', csv('Uber Ana', 30), 'nubank-2026-03.csv')
        .expect(201);
      await bia
        .post('/import')
        .attach('files', csv('Uber Bia', 70), 'nubank-2026-03.csv')
        .expect(201);

      // Compras: cada uma vê a sua, e os agregados descrevem só a sua.
      const comprasAna = await ana.get('/purchase').expect(200);
      assert.deepEqual(
        comprasAna.body.purchases.map((p: { title: string }) => p.title),
        ['Uber Ana'],
      );
      assert.equal(comprasAna.body.sum, 30);

      const comprasBia = await bia.get('/purchase').expect(200);
      assert.equal(comprasBia.body.total, 1);
      assert.equal(comprasBia.body.sum, 70);

      // Faturas: o mesmo mês de referência para as duas, com valores próprios.
      const faturasAna = await ana.get('/purchase/bill').expect(200);
      assert.equal(faturasAna.body.length, 1);
      assert.equal(faturasAna.body[0].total, 30);

      // Regras e categorias: a de uma não classifica a compra da outra.
      await ana
        .post('/category-rule')
        .send({ kind: 'contains', value: 'uber', category: 'mobilidade-ana' })
        .expect(201);

      const categoriasBia = await bia.get('/category').expect(200);
      assert.equal(
        categoriasBia.body.some((c: { name: string }) => c.name === 'mobilidade-ana'),
        false,
      );

      const comprasBiaDepois = await bia.get('/purchase').expect(200);
      assert.equal(comprasBiaDepois.body.purchases[0].category, 'transporte');

      // A regra da Ana não aparece na lista da Bia...
      const regrasBia = await bia.get('/category-rule').expect(200);
      assert.deepEqual(regrasBia.body, []);

      // ...e nem responde ao id dela: 404, e não 200 nem 204.
      const regrasAna = await ana.get('/category-rule').expect(200);
      const idDaRegraDaAna = regrasAna.body[0]._id;

      await bia
        .patch(`/category-rule/${idDaRegraDaAna}`)
        .send({ kind: 'contains', value: 'uber', category: 'sequestrada' })
        .expect(404);
      await bia.delete(`/category-rule/${idDaRegraDaAna}`).expect(404);

      // A regra continua inteira e ainda governando a compra da Ana.
      const comprasAnaDepois = await ana.get('/purchase').expect(200);
      assert.equal(comprasAnaDepois.body.purchases[0].category, 'mobilidade-ana');

      // Apelido de assinatura: mesma chave, dono diferente, sem colisão de índice.
      await ana.post('/subscription').send({ key: 'uber', name: 'Uber da Ana' }).expect(201);
      await bia.post('/subscription').send({ key: 'uber', name: 'Uber da Bia' }).expect(201);

      // Categoria criada por uma não aparece nem bloqueia a outra.
      await ana.post('/category').send({ name: 'compartilhada' }).expect(201);
      await bia.post('/category').send({ name: 'compartilhada' }).expect(201);

      // Reimportar não mexe no mês da vizinha.
      await bia
        .post('/import')
        .attach('files', csv('Uber Bia', 70), 'nubank-2026-03.csv')
        .expect(201);
      assert.equal((await ana.get('/purchase').expect(200)).body.total, 1);
    });
  });
});
