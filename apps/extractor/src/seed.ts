/**
 * Popula o banco com faturas fictícias, para o dashboard abrir com dados sem
 * precisar de Google Drive nem de uma fatura real. `pnpm db:seed` na raiz.
 *
 * Os dados são gerados com um PRNG de semente fixa: rodar duas vezes produz
 * exatamente o mesmo banco.
 */
import type { Bill } from '@expense/ingestion';
import { connect, writeBill } from './mongo';

const MONTHS_OF_HISTORY = 18;

const MERCHANTS: Array<{ title: string; category: string; min: number; max: number }> = [
  { title: 'PAO DE ACUCAR', category: 'supermercado', min: 45, max: 380 },
  { title: 'CARREFOUR', category: 'supermercado', min: 60, max: 420 },
  { title: 'HORTIFRUTI', category: 'supermercado', min: 25, max: 140 },
  { title: 'UBER TRIP', category: 'transporte', min: 9, max: 65 },
  { title: '99APP', category: 'transporte', min: 8, max: 55 },
  { title: 'POSTO IPIRANGA', category: 'transporte', min: 90, max: 260 },
  { title: 'IFOOD', category: 'restaurante', min: 22, max: 120 },
  { title: 'PADARIA BELA VISTA', category: 'restaurante', min: 12, max: 60 },
  { title: 'OUTBACK', category: 'restaurante', min: 90, max: 280 },
  { title: 'NETFLIX', category: 'serviços', min: 39, max: 55 },
  { title: 'SPOTIFY', category: 'serviços', min: 21, max: 35 },
  { title: 'AMAZON PRIME', category: 'serviços', min: 14, max: 20 },
  { title: 'KABUM', category: 'eletrônicos', min: 120, max: 2400 },
  { title: 'APPLE STORE', category: 'eletrônicos', min: 200, max: 3200 },
  { title: 'RENNER', category: 'vestuário', min: 80, max: 520 },
  { title: 'NIKE STORE', category: 'vestuário', min: 150, max: 780 },
  { title: 'CINEMARK', category: 'lazer', min: 30, max: 120 },
  { title: 'STEAM GAMES', category: 'lazer', min: 25, max: 300 },
  { title: 'DROGARIA SP', category: 'saúde', min: 18, max: 240 },
  { title: 'SMART FIT', category: 'saúde', min: 90, max: 130 },
  { title: 'LEROY MERLIN', category: 'casa', min: 60, max: 900 },
  { title: 'IKEA', category: 'casa', min: 100, max: 1500 },
  { title: 'LATAM AIRLINES', category: 'viagem', min: 400, max: 2600 },
  { title: 'AIRBNB', category: 'viagem', min: 250, max: 1800 },
  { title: 'UDEMY', category: 'educação', min: 25, max: 190 },
  { title: 'ALURA', category: 'educação', min: 85, max: 120 },

  // Os que caem em `outros`, para a tela de classificação abrir com trabalho de
  // verdade nos dados de exemplo. São os títulos que o emissor exporta sem
  // categoria e que nenhuma palavra-chave alcança: sigla de adquirente,
  // asterisco e o nome do estabelecimento cortado ao meio. A variação de caixa
  // em "Mercadolivre" é de propósito — é assim que a mesma loja chega em meses
  // diferentes, e é o que a tela precisa saber agrupar.
  { title: 'Mercadolivre*Mercadol', category: 'outros', min: 35, max: 890 },
  { title: 'MERCADOLIVRE*MERCADOL', category: 'outros', min: 40, max: 620 },
  { title: 'Pag*Ferreiralanches', category: 'outros', min: 18, max: 95 },
  { title: 'Ebn*Pantanal Servicos', category: 'outros', min: 60, max: 340 },
  { title: 'PP*JOAO BATISTA', category: 'outros', min: 25, max: 180 },
];

/** LCG simples — determinismo sem dependência externa. */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function buildBills(): Bill[] {
  const random = createRandom(20240221);
  const bills: Bill[] = [];
  const now = new Date();

  for (let offset = MONTHS_OF_HISTORY - 1; offset >= 0; offset--) {
    const referenceMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
    );
    const daysInMonth = new Date(
      Date.UTC(referenceMonth.getUTCFullYear(), referenceMonth.getUTCMonth() + 1, 0),
    ).getUTCDate();

    const data = [];
    const purchaseCount = 28 + Math.floor(random() * 25);

    for (let i = 0; i < purchaseCount; i++) {
      const merchant = MERCHANTS[Math.floor(random() * MERCHANTS.length)];
      const day = 1 + Math.floor(random() * daysInMonth);
      data.push({
        title: merchant.title,
        amount: Math.round((merchant.min + random() * (merchant.max - merchant.min)) * 100) / 100,
        date: new Date(
          Date.UTC(referenceMonth.getUTCFullYear(), referenceMonth.getUTCMonth(), day),
        ),
        category: merchant.category,
        sourceCategory: merchant.category,
        referenceMonth,
      });
    }

    // O pagamento da fatura: a API o separa dos gastos pela categoria `payment`.
    const total = data.reduce((acc, purchase) => acc + purchase.amount, 0);
    data.push({
      title: 'Pagamento recebido',
      amount: Math.round(total * 100) / 100,
      date: new Date(Date.UTC(referenceMonth.getUTCFullYear(), referenceMonth.getUTCMonth(), 10)),
      category: 'payment',
      sourceCategory: 'payment',
      referenceMonth,
    });

    bills.push({ referenceMonth, data });
  }

  return bills;
}

async function main() {
  const bills = buildBills();
  const { client, purchases } = await connect();
  try {
    console.log(`Populando o banco com ${bills.length} faturas de exemplo:`);
    for (const bill of bills) {
      await writeBill(purchases, bill);
      console.log(`  ${bill.referenceMonth.toISOString().slice(0, 7)}: ${bill.data.length} compras`);
    }
    const total = bills.reduce((acc, bill) => acc + bill.data.length, 0);
    console.log(`Pronto: ${total} compras fictícias gravadas.`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
