import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MongoStore } from 'connect-mongo';
// `express-session` só declara `export =` — sem esModuleInterop no tsconfig,
// um `import session from` compilaria para `.default`, que o CJS dele não tem.
import * as session from 'express-session';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS_ORIGIN vazio libera qualquer origem — conveniente em dev, e é o que a
  // app fazia antes. Em produção, liste as origens separadas por vírgula.
  // `credentials: true` é o que faz o navegador mandar o cookie de sessão numa
  // origem diferente (5173 → 3000): sem ele, o front autentica e a próxima
  // chamada chega sem cookie nenhum.
  const origins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length > 0 ? origins : true, credentials: true });

  const mongoUri = process.env.MONGO_URI;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!mongoUri || !sessionSecret) {
    throw new Error(
      'MONGO_URI e SESSION_SECRET precisam estar no .env. Copie .env.example para .env na raiz do repositório.',
    );
  }

  // A sessão vive no Mongo, e não em memória, porque a API sobe com `nest start
  // --watch`: cada salvamento de arquivo reinicia o processo, e uma store em
  // memória derrubaria a sessão a cada hot-reload.
  app.use(
    session({
      name: 'expense.sid',
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: mongoUri, collectionName: 'sessions' }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('Expense Analyzer')
    .setDescription('Compras e faturas do cartão de crédito, agregadas por mês e categoria.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API em http://localhost:${port} — docs em http://localhost:${port}/docs`);
}

void bootstrap();
