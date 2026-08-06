import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module';
import { PasswordReset, PasswordResetSchema } from '../schemas/password-reset.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionAuthGuard } from './session-auth.guard';

@Module({
  imports: [
    MailModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: PasswordReset.name, schema: PasswordResetSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: APP_GUARD, useClass: SessionAuthGuard }],
  // O módulo de sincronização pergunta quem é o dono da instância antes de
  // deixar alguém disparar a ingestão do Drive.
  exports: [AuthService],
})
export class AuthModule {}
