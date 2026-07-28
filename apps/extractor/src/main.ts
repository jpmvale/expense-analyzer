import { reapplyRules } from '@expense/categorization';
import { config } from './config';
import { Bill } from './interfaces/bill';
import {
  backfillSourceCategory,
  connect,
  createPurchaseStore,
  loadRules,
  writeBill,
} from './mongo';
import { fetchBillsFromDrive } from './sources/drive';
import { fetchBillsFromDisk } from './sources/local';

/**
 * Grava-se uma fatura por mês de referência, apagando o mês antes. Dois arquivos
 * apontando para o mesmo mês — o Drive aceita nomes repetidos — fazem o segundo
 * sobrescrever o primeiro sem dizer nada. Avisar é melhor que perder em silêncio.
 */
function warnDuplicateMonths(bills: Bill[]): void {
  const seen = new Map<string, number>();
  for (const bill of bills) {
    const month = bill.referenceMonth.toISOString().slice(0, 7);
    seen.set(month, (seen.get(month) ?? 0) + 1);
  }

  for (const [month, count] of seen) {
    if (count > 1) {
      console.warn(
        `Atenção: ${count} arquivos apontam para a fatura de ${month}. ` +
          'Só o último será gravado — confira se são duplicatas do mesmo arquivo.',
      );
    }
  }
}

async function main() {
  if (config.source !== 'drive' && config.source !== 'local') {
    throw new Error(`EXTRACTOR_SOURCE inválido: "${config.source}". Use "drive" ou "local".`);
  }

  console.log(
    config.source === 'drive'
      ? 'Buscando as faturas no Google Drive...'
      : `Lendo as faturas de ${config.billsDir}...`,
  );

  const bills =
    config.source === 'drive' ? await fetchBillsFromDrive() : await fetchBillsFromDisk();

  if (bills.length === 0) {
    console.log('Nenhuma fatura encontrada — nada a gravar.');
    return;
  }

  warnDuplicateMonths(bills);

  const { client, purchases, rules } = await connect();
  try {
    console.log(`Gravando ${bills.length} faturas no MongoDB:`);
    for (const bill of bills) {
      await writeBill(purchases, bill);
    }
    const total = bills.reduce((acc, bill) => acc + bill.data.length, 0);
    console.log(`Pronto: ${total} compras gravadas.`);

    // Reprocessar reescreve o mês inteiro, então a classificação do usuário
    // precisa ser recarimbada depois — é o passo que impede `pnpm extract` de
    // desfazer o trabalho de quem categorizou na tela.
    //
    // Roda mesmo sem regra nenhuma. A reaplicação deixou de ser só sobre regras
    // quando passou a redecidir a camada de encargo, e um `if (rules.length > 0)`
    // aqui significava que um mês lido isolado ficava com a lista de encargo do
    // dia em que foi extraído.
    await backfillSourceCategory(purchases);
    const userRules = await loadRules(rules);
    const { classified, restored, financing } = await reapplyRules(
      createPurchaseStore(purchases),
      userRules,
    );

    if (classified + restored + financing > 0) {
      console.log(
        `Reaplicadas ${userRules.length} regras: ${classified} classificadas, ` +
          `${restored} devolvidas, ${financing} em encargos.`,
      );
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
