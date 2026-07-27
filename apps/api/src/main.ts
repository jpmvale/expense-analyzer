import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS_ORIGIN vazio libera qualquer origem — conveniente em dev, e é o que a
  // app fazia antes. Em produção, liste as origens separadas por vírgula.
  const origins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length > 0 ? origins : true });

  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('Nubank Credit Card Analysis')
    .setDescription('Compras e faturas do cartão de crédito, agregadas por mês e categoria.')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`API em http://localhost:${port} — docs em http://localhost:${port}/docs`);
}

void bootstrap();
