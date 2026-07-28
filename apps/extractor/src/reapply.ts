/**
 * Reaplica as regras e a camada de encargo sobre a base já gravada, sem
 * reextrair nada. `pnpm reapply` na raiz.
 *
 * Existe por causa de um caso só, mas um que nenhum outro caminho cobre: quando
 * a **tabela de palavras-chave de encargo muda no código**. Criar, editar ou
 * apagar uma regra já reaplica sozinho, e `pnpm extract` reaplica no fim — o que
 * fica de fora é o deploy que acrescenta `juros rotativo` à lista e precisa que
 * isso valha para o que já está no banco. Reextrair resolveria, mas exige ainda
 * ter os CSVs; quem só tem o banco não teria como.
 *
 * É a mesma operação que a API expõe em `POST /category-rule/reapply`, e o
 * mesmo motor que roda depois de cada extração: idempotente, e sempre a partir
 * de `sourceCategory` mais as regras de agora — nunca do que estava gravado.
 */
import { reapplyRules } from '@expense/categorization';
import { backfillSourceCategory, connect, createPurchaseStore, loadRules } from './mongo';

async function main() {
  const { client, purchases, rules } = await connect();

  try {
    const backfilled = await backfillSourceCategory(purchases);
    if (backfilled > 0) {
      console.log(`${backfilled} compras antigas ganharam \`sourceCategory\`.`);
    }

    const userRules = await loadRules(rules);
    const { classified, restored, financing } = await reapplyRules(
      createPurchaseStore(purchases),
      userRules,
    );

    if (classified + restored + financing === 0) {
      console.log(`Nada mudou: a base já está de acordo com as ${userRules.length} regras de agora.`);
      return;
    }

    console.log(`Reaplicadas ${userRules.length} regras:`);
    console.log(`  ${classified} compras classificadas por uma regra`);
    console.log(`  ${restored} devolvidas à categoria que veio da fatura`);
    console.log(`  ${financing} entraram ou saíram de encargos`);

    // Os dois primeiros números repartem o gasto; o terceiro muda o total, porque
    // encargo fica fora dele. Vale dizer em voz alta, senão a diferença aparece
    // sozinha na Visão geral e ninguém liga uma coisa à outra.
    if (financing > 0) {
      console.log('\nAtenção: encargo fica fora do total gasto — os totais por mês mudaram.');
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
