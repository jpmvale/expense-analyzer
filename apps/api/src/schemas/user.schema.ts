import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

/**
 * Uma conta do app.
 *
 * Antes não havia coleção nenhuma: o usuário único morava em `AUTH_USERNAME` e
 * `AUTH_PASSWORD_HASH` no `.env`, e a sessão guardava o próprio nome. O `_id`
 * daqui é o que passa a carimbar cada compra, regra e categoria — em vez do
 * nome, para que renomear uma conta um dia não obrigue a reescrever a base
 * inteira.
 *
 * `type` explícito nos dois campos: o `emitDecoratorMetadata` só existe sob o
 * compilador do TypeScript, e os testes rodam sob esbuild, que não o emite.
 */
@Schema({ collection: 'users', timestamps: { createdAt: true, updatedAt: false } })
export class User {
  /**
   * Guardado em minúsculas, e é assim que o login compara.
   *
   * Sem normalizar, `Ana` e `ana` seriam duas contas distintas — e como o
   * cadastro é o mesmo formulário que o login, quem digitasse com a caixa
   * trocada criaria uma conta vazia em vez de entrar na sua.
   */
  @Prop({ type: String, required: true })
  username: string;

  /** bcrypt, custo 12 — o mesmo do script `hash-password`. */
  @Prop({ type: String, required: true })
  passwordHash: string;

  createdAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ username: 1 }, { unique: true });
