// Sem `esModuleInterop`, um `import padrão` destes dois viraria `.default`,
// que nenhum dos dois tem sob `ts-node` — só `import = require` funciona aqui.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import assert = require('node:assert/strict');
import { after, before, describe, it } from 'node:test';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');
import { loginAgent, startTestApp, type TestApp } from './testing/http';

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

  describe('login', () => {
    it('recusa credenciais erradas', async () => {
      await request(testApp.server)
        .post('/auth/login')
        .send({ username: testApp.credentials.username, password: 'senha-errada' })
        .expect(401);
    });

    it('aceita credenciais corretas e abre sessão', async () => {
      const agent = request.agent(testApp.server);
      const res = await agent.post('/auth/login').send(testApp.credentials).expect(201);
      assert.equal(res.body.username, testApp.credentials.username);

      const session = await agent.get('/auth/session').expect(200);
      assert.equal(session.body.authenticated, true);
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
});
