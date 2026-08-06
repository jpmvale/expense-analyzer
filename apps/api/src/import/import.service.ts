import {
  billsFromCsvFiles,
  collectingLogger,
  ingestBills,
  type CsvFileOutcome,
  type IngestionResult,
} from '@expense/ingestion';
import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CategoryRule, CategoryRuleDocument } from '../schemas/category-rule.schema';
import { Purchase, PurchaseDocument } from '../schemas/purchase.schema';
import { SyncRun, SyncRunDocument } from '../schemas/sync-run.schema';
import { createBillStore } from '../sync/bill-store';

/** Um CSV que chegou pelo upload, já lido para a memória pelo multer. */
export interface UploadedCsv {
  originalname: string;
  buffer: Buffer;
}

export interface ImportResultView {
  /** O que aconteceu com cada arquivo, na ordem em que foram processados. */
  files: CsvFileOutcome[];
  result: IngestionResult;
  /** O relato linha a linha, o mesmo texto que o `pnpm extract` imprime. */
  log: string[];
}

/**
 * Ingestão de faturas enviadas pela tela, para quem não tem Google Drive.
 *
 * A rota é nova; o que ela faz, não. Os CSVs viram `Bill[]` pelo mesmo
 * `billsFromCsvFiles` que a fonte `local` usa, e vão para o mesmo `ingestBills`
 * que o Drive dispara — de onde vêm de graça as duas garantias que importam:
 * reenviar o mesmo mês **sobrescreve** em vez de duplicar, e as regras do
 * usuário são reaplicadas depois da gravação, então importar não desfaz o que
 * ele classificou na tela.
 *
 * Diferente do `/sync`, responde **síncrono**. O 202 de lá existe porque ler 95
 * faturas do Drive leva mais de um minuto e um proxy cortaria a conexão no meio;
 * aqui os arquivos já chegaram, e o que falta é parsear e gravar — trabalho de
 * milissegundos, que cabe na resposta.
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(CategoryRule.name) private readonly ruleModel: Model<CategoryRuleDocument>,
    @InjectModel(SyncRun.name) private readonly runModel: Model<SyncRunDocument>,
  ) {}

  async importCsvs(userId: Types.ObjectId, uploads: UploadedCsv[]): Promise<ImportResultView> {
    if (uploads.length === 0) {
      throw new BadRequestException('Nenhum arquivo recebido. Mande os CSVs no campo "files".');
    }

    // O mesmo travamento do `/sync`, e por usuário: duas ingestões concorrentes
    // sobre o mesmo mês apagariam e regravariam uma por cima da outra, e o
    // resultado dependeria de qual terminasse por último.
    const running = await this.runModel.exists({ userId, status: 'running' }).exec();
    if (running) {
      throw new ConflictException('Uma sincronização já está em andamento.');
    }

    const { logger, lines } = collectingLogger();
    const run = await this.runModel.create({
      userId,
      trigger: 'upload',
      status: 'running',
      startedAt: new Date(),
    });

    try {
      const { bills, files } = billsFromCsvFiles(
        uploads.map((upload) => ({
          name: upload.originalname,
          content: upload.buffer.toString('utf-8'),
        })),
        logger,
        // Ao contrário do disco e do Drive: quem escolheu o arquivo na tela está
        // dizendo que aquilo é uma fatura, então o mês pode sair das datas de
        // dentro dele quando o nome não trouxer `AAAA-MM`.
        { inferMonthFromContent: true },
      );

      const result = await ingestBills(
        bills,
        createBillStore(this.purchaseModel, this.ruleModel, userId),
        logger,
      );

      await this.runModel
        .updateOne(
          { _id: run._id },
          { $set: { status: 'ok', finishedAt: new Date(), ...result, log: lines } },
        )
        .exec();

      return { files, result, log: lines };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Importação falhou: ${message}`);

      // O registro é gravado antes de relançar: sem isto o documento ficaria em
      // `running` para sempre e travaria as importações seguintes deste usuário.
      await this.runModel
        .updateOne(
          { _id: run._id },
          { $set: { status: 'error', finishedAt: new Date(), message, log: lines } },
        )
        .exec();

      throw error;
    }
  }
}
