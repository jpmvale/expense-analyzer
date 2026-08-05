import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CategoryModule } from './category/category.module';
import { PurchaseModule } from './purchase/purchase.module';
import { SyncModule } from './sync/sync.module';

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
    CategoryModule,
    AuthModule,
    SyncModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
