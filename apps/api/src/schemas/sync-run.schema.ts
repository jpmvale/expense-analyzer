import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

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
  /** `manual` é o botão da tela; `cli` é o `pnpm extract` e o cron da VPS. */
  @Prop({ type: String, required: true, enum: ['manual', 'cli'] })
  trigger: 'manual' | 'cli';

  @Prop({ type: String, required: true, enum: ['running', 'ok', 'error'] })
  status: 'running' | 'ok' | 'error';

  /** Indexado decrescente: toda leitura desta coleção é "a mais recente". */
  @Prop({ type: Date, required: true, index: true })
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
