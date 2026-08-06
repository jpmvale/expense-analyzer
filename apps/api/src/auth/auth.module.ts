import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../schemas/user.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './session-auth.guard';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: SessionAuthGuard }],
  // O módulo de sincronização pergunta quem é o dono da instância antes de
  // deixar alguém disparar a ingestão do Drive.
  exports: [AuthService],
})
export class AuthModule {}
