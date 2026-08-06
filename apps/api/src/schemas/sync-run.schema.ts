import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type SyncRunDocument = HydratedDocument<SyncRun>;

/**
 * Uma execução da ingestão: quando começou, como terminou e o que mexeu.
 *
 * A coleção existe para responder à pergunta que a app não sabia responder —
 * "em que momento isto foi atualizado?". Antes a ingestão era um comando de
 * terminal que não deixava rastro nenhum no banco: baixar uma fatura nova no
 * Drive e abrir a tela dava exatamente a mesma imagem de antes, sem nada que
 * dissesse que faltava sincronizar.
 *
 * O extractor grava aqui também, com `trigger: 'cli'`. Ele e o botão fazem a
 * mesma coisa com o banco, e a tela não tem por que distinguir quem disparou —
 * se distinguisse, uma extração pelo cron da madrugada apareceria como "nunca
 * sincronizado".
 *
 * `type` explícito em todos os campos: o `emitDecoratorMetadata` só existe sob o
 * compilador do TypeScript, e os testes rodam sob esbuild, que não o emite.
 */
@Schema({ collection: 'syncRuns' })
export class SyncRun {
  /** De quem foi esta execução — o `_id` na coleção `users`. */
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  userId: Types.ObjectId;

  /**
   * `manual` é o botão da tela; `cli` é o `pnpm extract` e o cron da VPS;
   * `upload` é o envio de CSVs por `POST /import`.
   *
   * Os três gravam aqui pelo mesmo motivo de sempre: a tela pergunta "quando
   * isto foi atualizado?", e essa resposta não depende de quem disparou. Sem o
   * `upload` na lista, quem nunca vai usar o Drive veria "nunca sincronizado"
   * logo depois de subir doze faturas.
   */
  @Prop({ type: String, required: true, enum: ['manual', 'cli', 'upload'] })
  trigger: 'manual' | 'cli' | 'upload';

  @Prop({ type: String, required: true, enum: ['running', 'ok', 'error'] })
  status: 'running' | 'ok' | 'error';

  @Prop({ type: Date, required: true })
  startedAt: Date;

  @Prop({ type: Date })
  finishedAt?: Date;

  @Prop({ type: Number })
  bills?: number;

  @Prop({ type: Number })
  purchases?: number;

  @Prop({ type: Number })
  rules?: number;

  @Prop({ type: Number })
  classified?: number;

  @Prop({ type: Number })
  restored?: number;

  @Prop({ type: Number })
  financing?: number;

  /** A mensagem do erro, quando `status` é `error`. */
  @Prop({ type: String })
  message?: string;

  /**
   * O relato da execução, linha a linha — o mesmo texto que o `pnpm extract`
   * imprime no terminal.
   *
   * Guardado porque é a única pista de vários casos que não são erro e não
   * mudam contagem nenhuma: um arquivo ignorado por ter nome fora do padrão
   * `<ano>-<mês>`, dois arquivos disputando o mesmo mês, linhas descartadas por
   * valor ilegível. No terminal isso passava na frente de quem rodava; pelo
   * botão, sem guardar, não passaria em lugar nenhum.
   */
  @Prop({ type: [String] })
  log?: string[];
}

export const SyncRunSchema = SchemaFactory.createForClass(SyncRun);

// Decrescente porque toda leitura desta coleção é "a mais recente **deste**
// usuário" — o índice responde à ordenação sem varrer o histórico dos outros.
SyncRunSchema.index({ userId: 1, startedAt: -1 });
