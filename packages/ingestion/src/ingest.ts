import { CategoryRule, PurchaseStore, reapplyRules } from '@expense/categorization';
import { Bill } from './interfaces/bill';
import { IngestionLogger } from './logger';

/**
 * Tudo o que a ingestão precisa do banco. Duas implementações obedecem a este
 * contrato: a do extractor, no driver cru do MongoDB, e a da API, em Mongoose —
 * o mesmo arranjo que o `PurchaseStore` já usava no pacote de categorização, e
 * pelo mesmo motivo: a ordem das operações é uma decisão só, e ela não deve
 * existir em duas cópias que podem divergir.
 */
export interface BillStore {
  /** Apaga o mês de referência e grava as compras da fatura no lugar. */
  replaceMonth(bill: Bill): Promise<void>;
  /** Dá `sourceCategory` às compras gravadas antes do campo existir. */
  backfillSourceCategory(): Promise<number>;
  /** As regras do usuário, para a reaplicação depois da gravação. */
  loadRules(): Promise<CategoryRule[]>;
  /** A ponta que a reaplicação usa para ler e reescrever categorias. */
  purchases: PurchaseStore;
}

export interface IngestionResult {
  /** Faturas gravadas. */
  bills: number;
  /** Compras gravadas, somando todas as faturas. */
  purchases: number;
  /** Quantas regras do usuário foram reaplicadas. */
  rules: number;
  classified: number;
  restored: number;
  financing: number;
}

/**
 * Grava as faturas e devolve a base ao estado que as regras do usuário mandam.
 *
 * Reprocessar reescreve o mês inteiro, então a classificação do usuário precisa
 * ser recarimbada depois — é o passo que impede uma extração de desfazer o
 * trabalho de quem categorizou na tela.
 *
 * A reaplicação roda mesmo sem regra nenhuma. Ela deixou de ser só sobre regras
 * quando passou a redecidir a camada de encargo, e um `if (rules.length > 0)`
 * aqui significaria que um mês lido isolado ficaria com a lista de encargo do dia
 * em que foi extraído.
 */
export async function ingestBills(
  bills: Bill[],
  store: BillStore,
  logger: IngestionLogger,
): Promise<IngestionResult> {
  // Sem fatura nenhuma não há o que reaplicar: a reaplicação existe para desfazer
  // o estrago da regravação, e não houve regravação. Sair aqui também é o que
  // evita que um filtro do Drive que não casa com nada seja relatado como uma
  // sincronização que "deu certo" e mexeu no banco.
  if (bills.length === 0) {
    logger.info('Nenhuma fatura encontrada — nada a gravar.');
    return { bills: 0, purchases: 0, rules: 0, classified: 0, restored: 0, financing: 0 };
  }

  logger.info(`Gravando ${bills.length} faturas no MongoDB:`);

  for (const bill of bills) {
    await store.replaceMonth(bill);
    const month = bill.referenceMonth.toISOString().slice(0, 7);
    logger.info(`  ${month}: ${bill.data.length} compras`);
  }

  const purchases = bills.reduce((acc, bill) => acc + bill.data.length, 0);
  logger.info(`Pronto: ${purchases} compras gravadas.`);

  await store.backfillSourceCategory();
  const rules = await store.loadRules();
  const { classified, restored, financing } = await reapplyRules(store.purchases, rules);

  if (classified + restored + financing > 0) {
    logger.info(
      `Reaplicadas ${rules.length} regras: ${classified} classificadas, ` +
        `${restored} devolvidas, ${financing} em encargos.`,
    );
  }

  return {
    bills: bills.length,
    purchases,
    rules: rules.length,
    classified,
    restored,
    financing,
  };
}
