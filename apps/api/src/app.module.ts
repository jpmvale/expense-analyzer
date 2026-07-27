import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { PurchaseModule } from './purchase/purchase.module';

// O .env é único e mora na raiz do monorepo. `__dirname` é `apps/api/src` em dev
// (nest start) e `apps/api/dist` depois do build — mesma profundidade nos dois.
const rootEnv = resolve(__dirname, '../../../.env');

@Module({
  imports: [
    ConfigModule.forRoot({ envFilePath: [rootEnv, '.env'], isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uri = config.get<string>('MONGO_URI');
        if (!uri) {
          throw new Error(
            'MONGO_URI não definida. Copie .env.example para .env na raiz do repositório.',
          );
        }
        return { uri };
      },
    }),
    PurchaseModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
