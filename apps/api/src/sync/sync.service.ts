import { collectingLogger, fetchBills, ingestBills, type IngestionConfig } from '@expense/ingestion';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CategoryRule, CategoryRuleDocument } from '../schemas/category-rule.schema';
import { Purchase, PurchaseDocument } from '../schemas/purchase.schema';
import { SyncRun, SyncRunDocument } from '../schemas/sync-run.schema';
import { createBillStore } from './bill-store';
import { ingestionConfigFrom } from './ingestion-config';

/**
 * A partir de quando uma execução marcada como "rodando" é considerada morta.
 *
 * Sem este limite, um container derrubado no meio de uma extração deixaria o
 * documento em `running` para sempre — e como é ele que impede duas ingestões
 * simultâneas, o botão ficaria travado até alguém editar o banco na mão. Uma
 * extração real das 95 faturas leva menos de dois minutos; meia hora é folga
 * larga o suficiente para nunca cortar uma que ainda está viva.
 */
const STALE_RUN_MS = 30 * 60 * 1000;

export interface SyncStatusView {
  /** Se há uma ingestão em andamento agora — pelo botão ou pela linha de comando. */
  running: boolean;
  /** A execução mais recente, seja ela qual for. `null` antes da primeira. */
  lastRun: SyncRun | null;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly ingestion: IngestionConfig;

  constructor(
    @InjectModel(SyncRun.name) private readonly runModel: Model<SyncRunDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(CategoryRule.name) private readonly ruleModel: Model<CategoryRuleDocument>,
    config: ConfigService,
  ) {
    this.ingestion = ingestionConfigFrom(config);
  }

  /** O estado de agora e a última execução, para a tela responder "quando?". */
  async status(): Promise<SyncStatusView> {
    const lastRun = await this.runModel.findOne().sort({ startedAt: -1 }).exec();
    if (!lastRun) return { running: false, lastRun: null };

    if (lastRun.status !== 'running') {
      return { running: false, lastRun: lastRun.toObject() };
    }

    if (Date.now() - lastRun.startedAt.getTime() < STALE_RUN_MS) {
      return { running: true, lastRun: lastRun.toObject() };
    }

    // Passou do limite: quem estava rodando morreu sem escrever o desfecho.
    // Carimbar aqui, na leitura, em vez de deixar para um job de limpeza: é o
    // único momento em que alguém se importa com o estado, e deixá-lo como
    // `running` mentiria para a tela e travaria o botão.
    lastRun.status = 'error';
    lastRun.finishedAt = new Date();
    lastRun.message =
      'A sincronização foi interrompida antes de terminar — o processo caiu ou foi derrubado.';
    await lastRun.save();
    return { running: false, lastRun: lastRun.toObject() };
  }

  /**
   * Dispara uma ingestão e devolve na hora, sem esperar por ela.
   *
   * Ler 95 faturas do Drive leva mais de um minuto, e segurar a resposta HTTP
   * por esse tempo entregaria a decisão a um timeout de proxy: o Caddy corta a
   * conexão, o navegador mostra erro, e a extração — que continua rodando — vira
   * um resultado que ninguém sabe se aconteceu. O estado vai para o banco, e a
   * tela pergunta por ele em `GET /sync`.
   */
  async start(): Promise<SyncStatusView> {
    const current = await this.status();
    if (current.running) {
      throw new ConflictException('Uma sincronização já está em andamento.');
    }

    const run = await this.runModel.create({
      trigger: 'manual',
      status: 'running',
      startedAt: new Date(),
    });

    // Sem `await`: a resposta sai agora. O `catch` não é decoração — uma promise
    // solta que rejeita derruba o processo inteiro do Node, e aqui ela roda fora
    // do ciclo de vida da requisição, onde nenhum filtro de exceção do Nest a
    // alcançaria.
    void this.execute(run._id).catch((error: unknown) => {
      this.logger.error(`Falha ao registrar o fim da sincronização: ${String(error)}`);
    });

    return this.status();
  }

  /**
   * A ingestão em si — a mesma que o `pnpm extract` roda, pelo mesmo pacote.
   *
   * Nunca relança: quem chamou já respondeu ao navegador faz tempo. O desfecho,
   * inclusive o erro, vira estado no banco, que é onde a tela vai procurá-lo.
   */
  private async execute(id: Types.ObjectId): Promise<void> {
    const { logger, lines } = collectingLogger();

    try {
      const bills = await fetchBills(this.ingestion, logger);
      const result = await ingestBills(
        bills,
        createBillStore(this.purchaseModel, this.ruleModel),
        logger,
      );

      await this.runModel
        .updateOne(
          { _id: id },
          { $set: { status: 'ok', finishedAt: new Date(), ...result, log: lines } },
        )
        .exec();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Sincronização falhou: ${message}`);

      await this.runModel
        .updateOne(
          { _id: id },
          { $set: { status: 'error', finishedAt: new Date(), message, log: lines } },
        )
        .exec();
    }
  }
}
