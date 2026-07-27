import { config } from './config';
import { connect, writeBill } from './mongo';
import { fetchBillsFromDrive } from './sources/drive';
import { fetchBillsFromDisk } from './sources/local';

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

  const { client, purchases } = await connect();
  try {
    console.log(`Gravando ${bills.length} faturas no MongoDB:`);
    for (const bill of bills) {
      await writeBill(purchases, bill);
    }
    const total = bills.reduce((acc, bill) => acc + bill.data.length, 0);
    console.log(`Pronto: ${total} compras gravadas.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
