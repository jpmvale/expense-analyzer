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

  /**
   * Para onde vai o link de redefinição de senha. Guardado em minúsculas, como o
   * nome, e é assim que "esqueci minha senha" procura a conta.
   *
   * Obrigatório no cadastro, mas **opcional no schema**: as contas criadas antes
   * de o campo existir não têm endereço nenhum, e exigi-lo aqui quebraria toda
   * gravação nelas — inclusive a da própria troca de senha. Uma conta sem e-mail
   * funciona para tudo, menos redefinir.
   */
  @Prop({ type: String })
  email?: string;

  /** bcrypt, custo 12 — o mesmo do script `hash-password`. */
  @Prop({ type: String, required: true })
  passwordHash: string;

  createdAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ username: 1 }, { unique: true });

// Único **parcial**, e não único e pronto: as contas anteriores ao campo não têm
// `email`, e para um índice único comum elas colidem entre si — dois documentos
// sem o campo valem ambos como `null`, e a criação do índice falha na subida da
// API com um erro de chave duplicada que não menciona a causa.
UserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $exists: true } } },
);
