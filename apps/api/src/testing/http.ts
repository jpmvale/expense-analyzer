import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { hashSync } from 'bcryptjs';
import { MongoStore } from 'connect-mongo';
import * as session from 'express-session';
import { MongoMemoryServer } from 'mongodb-memory-server';
// Sem `esModuleInterop` no tsconfig, `import request from 'supertest'`
// compilaria para `.default` — que o `export =` do supertest não tem. `tsx`
// mascara isso com interop próprio; `ts-node` (usado por este arquivo, veja o
// porquê acima) não. `import = require` funciona igual nos dois.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');
import { AppModule } from '../app.module';

/**
 * A API inteira, de pé, contra um MongoDB real em memória — a camada que os
 * testes de serviço não tocam.
 *
 * `category.service.test.ts` e companhia chamam o serviço direto pelo
 * construtor, o que prova a decisão e a escrita mas pula o Nest inteiro: o
 * container de injeção de dependência, o guard de sessão, o `ValidationPipe`.
 * É exatamente aí que mora o risco que faltava cobrir — um módulo esquecido, um
 * decorator de rota errado, um guard que libera o que devia bloquear — porque
 * nenhum desses erros aparece testando o serviço isolado.
 *
 * `Test.createTestingModule({ imports: [AppModule] })` compila o `AppModule`
 * de verdade, não uma versão reduzida para teste: é a única forma de a
 * cobertura significar algo sobre a fiação real. `main.ts` registra sessão e
 * `ValidationPipe` fora do módulo — em `bootstrap()`, não em `AppModule` —,
 * então este arquivo repete exatamente os mesmos dois passos, ou o guard de
 * sessão nunca veria `req.session` e todo teste de autenticação mentiria.
 *
 * Por que este arquivo roda sob `ts-node` (`pnpm test:http`), e não sob o
 * `tsx` que o resto da suíte usa: `tsx` transpila com esbuild, que não emite
 * `emitDecoratorMetadata` — a resolução de tipo do Nest recebe `undefined` no
 * lugar de cada dependência, silenciosamente, e cada serviço quebra tentando
 * usar um construtor `undefined`. Os testes de serviço nunca esbarraram nisso
 * porque instanciam a classe direto, pulando exatamente a reflexão que falha.
 */
export interface TestApp {
  app: INestApplication;
  /** Para `supertest(server)` ou `supertest.agent(server)`. */
  server: ReturnType<INestApplication['getHttpServer']>;
  /** Credenciais válidas nesta instância — não são as do `.env` real. */
  credentials: { username: string; password: string };
  stop(): Promise<void>;
}

const TEST_USERNAME = 'teste';
const TEST_PASSWORD = 'senha-de-teste-nao-e-a-real';

export async function startTestApp(): Promise<TestApp> {
  const server = await MongoMemoryServer.create();
  const mongoUri = server.getUri();

  // `ConfigModule.forRoot` lê o `.env` real da raiz do repo, e o dotenv nunca
  // sobrescreve uma variável que já está em `process.env` — é por isso que
  // definir estas quatro ANTES de compilar o módulo basta para a API inteira
  // rodar contra o banco de teste, e não contra o Mongo de verdade.
  process.env.MONGO_URI = mongoUri;
  process.env.SESSION_SECRET = 'segredo-de-teste';
  process.env.AUTH_USERNAME = TEST_USERNAME;
  process.env.AUTH_PASSWORD_HASH = hashSync(TEST_PASSWORD, 4); // custo baixo: só testes

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();

  // `connect-mongo` abre sua própria conexão com o Mongo, separada da que o
  // Mongoose já mantém — `app.close()` não sabe dela, e sem fechá-la à parte
  // o processo nunca termina depois do último teste.
  const store = MongoStore.create({ mongoUrl: mongoUri, collectionName: 'sessions' });

  // Os mesmos dois passos de `main.ts`, fora dali porque pertencem ao
  // `bootstrap()` e não ao módulo. Divergir daqui faria o teste aprovar um
  // guard ou uma validação que a API de verdade não tem.
  app.use(
    session({
      name: 'expense.sid',
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store,
      cookie: { httpOnly: true, sameSite: 'lax', secure: false },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );

  await app.init();

  // Canário: se isto um dia apontar para o Mongo real, todo o resto deste
  // arquivo estaria mentindo — mais vale um teste falhando alto aqui do que
  // escrita silenciosa na base de verdade.
  const config = app.get(ConfigService);
  if (config.get('MONGO_URI') !== mongoUri) {
    await server.stop();
    throw new Error('MONGO_URI não apontou para o banco de teste — abortando antes de rodar nada.');
  }

  return {
    app,
    server: app.getHttpServer(),
    credentials: { username: TEST_USERNAME, password: TEST_PASSWORD },
    async stop() {
      await app.close();
      await store.close();
      await server.stop();
    },
  };
}

/** Faz login e devolve um agente que carrega o cookie de sessão entre chamadas. */
export async function loginAgent(testApp: TestApp): Promise<ReturnType<typeof request.agent>> {
  const agent = request.agent(testApp.server);
  await agent.post('/auth/login').send(testApp.credentials).expect(201);
  return agent;
}
