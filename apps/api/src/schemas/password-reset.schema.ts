import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type PasswordResetDocument = HydratedDocument<PasswordReset>;

/**
 * Um pedido de redefinição de senha em aberto.
 *
 * **O token não mora aqui.** O que vai no link do e-mail são 32 bytes
 * aleatórios; o que fica guardado é o SHA-256 deles. Um dump do banco — ou um
 * backup no R2 — não permite redefinir a senha de ninguém, que é exatamente o
 * que aconteceria se o token fosse gravado em texto puro.
 *
 * SHA-256 e não bcrypt de propósito: o token já é aleatório de alta entropia,
 * não há dicionário para atacar, e o bcrypt trunca a entrada em 72 bytes.
 *
 * `type` explícito em todos os campos: o `emitDecoratorMetadata` só existe sob o
 * compilador do TypeScript, e os testes rodam sob esbuild, que não o emite.
 */
@Schema({ collection: 'passwordResets', timestamps: { createdAt: true, updatedAt: false } })
export class PasswordReset {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId: Types.ObjectId;

  /** SHA-256 do token, em hexadecimal. É por ele que a redefinição procura. */
  @Prop({ type: String, required: true })
  tokenHash: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  /** Quando o token foi gasto. Presente = já usado, e não vale mais. */
  @Prop({ type: Date })
  usedAt?: Date;

  /** Usado também para o limite de um pedido por minuto por conta. */
  createdAt: Date;
}

export const PasswordResetSchema = SchemaFactory.createForClass(PasswordReset);

PasswordResetSchema.index({ tokenHash: 1 }, { unique: true });

// O mais recente de uma conta, que é o que o limite de taxa consulta.
PasswordResetSchema.index({ userId: 1, createdAt: -1 });

/**
 * O Mongo apaga o documento sozinho um dia depois de o token expirar.
 *
 * A expiração em si é conferida na leitura — o TTL do Mongo roda de minuto em
 * minuto e não serve como garantia de segurança. Isto aqui é faxina: sem ela a
 * coleção cresceria para sempre com tokens mortos.
 */
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });
