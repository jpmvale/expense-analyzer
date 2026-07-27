import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AggregatablePurchase,
  billCycleEnd,
  buildBill,
  buildBills,
  inferClosingDay,
} from './bill-aggregation';

const MARCO = new Date(Date.UTC(2025, 2, 1));

/** O dia em que o bug do recorte aparecia: a fatura de agosto fechou ontem. */
const HOJE = new Date(Date.UTC(2026, 6, 27));

function purchase(
  amount: number,
  category = 'outros',
  referenceMonth = MARCO,
  // O consumo de uma fatura vem do mês anterior ao vencimento: o padrão põe a
  // compra onde ela de fato cairia, perto do fechamento.
  date = new Date(Date.UTC(referenceMonth.getUTCFullYear(), referenceMonth.getUTCMonth() - 1, 26)),
): AggregatablePurchase {
  return { amount, category, referenceMonth, date };
}

/**
 * As compras de uma fatura, a última delas caindo no dia `closingDay` do mês
 * anterior ao vencimento e as outras nos dias imediatamente antes.
 */
function billPurchases(month: string, count: number, closingDay: number): AggregatablePurchase[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const referenceMonth = new Date(Date.UTC(year, monthNumber - 1, 1));
  return Array.from({ length: count }, (_, index) => ({
    amount: 10,
    category: 'outros',
    referenceMonth,
    date: new Date(Date.UTC(year, monthNumber - 2, closingDay - index)),
  }));
}

function categoria(bill: ReturnType<typeof buildBill>, name: string) {
  return bill.categoriesResult.find((c) => c.categoryByMonth === name);
}

describe('buildBill', () => {
  it('separa o pagamento dos gastos', () => {
    const bill = buildBill('2025-03', [
      purchase(100, 'supermercado'),
      purchase(300, 'payment'),
      purchase(200, 'transporte'),
    ]);

    assert.equal(bill.valuePaid, 300);
    assert.equal(bill.total, 300);
  });

  // Juros, multa e saldo rolado são o custo de financiar, não consumo. Somados
  // ao gasto, respondiam "quanto você gastou" com dinheiro que ninguém gastou —
  // na base de referência, um "Saldo em atraso" de R$ 10.023 em três linhas.
  describe('encargos', () => {
    it('tira os encargos do total e os devolve em linha própria', () => {
      const bill = buildBill('2025-03', [
        purchase(500, 'supermercado'),
        purchase(10023.13, 'encargos'),
        purchase(201.21, 'encargos'),
      ]);

      assert.equal(bill.total, 500);
      assert.equal(bill.charges, 10224.34);
    });

    // O crédito do atraso é o outro lado do saldo rolado: os dois se encontram
    // dentro de `charges`, e nenhum dos dois passa pelo total.
    it('deixa o crédito de atraso abater o encargo, longe do gasto', () => {
      const bill = buildBill('2025-03', [
        purchase(300, 'restaurante'),
        purchase(10023.13, 'encargos'),
        purchase(-5307.88, 'encargos'),
      ]);

      assert.equal(bill.total, 300);
      assert.equal(bill.charges, 4715.25);
    });

    it('não conta encargo como compra nem como categoria do mês', () => {
      const bill = buildBill('2025-03', [
        purchase(500, 'supermercado'),
        purchase(200, 'encargos'),
      ]);

      assert.equal(bill.frequency, 1);
      assert.equal(categoria(bill, 'encargos'), undefined);
      assert.equal(categoria(bill, 'supermercado')?.percentage, 100);
    });

    it('devolve zero quando o mês não teve encargo', () => {
      assert.equal(buildBill('2025-03', [purchase(500, 'supermercado')]).charges, 0);
    });

    // `estorno` e `impostos` descrevem o tipo do lançamento, não a natureza do
    // dinheiro: continuam dentro do total, o estorno abatendo com sinal negativo.
    it('não confunde encargo com estorno ou imposto', () => {
      const bill = buildBill('2025-03', [
        purchase(500, 'supermercado'),
        purchase(-30, 'estorno'),
        purchase(2.5, 'impostos'),
      ]);

      assert.equal(bill.total, 472.5);
      assert.equal(bill.charges, 0);
    });
  });

  describe('valor pago', () => {
    // Regressão: um `.find()` pegava só o primeiro pagamento. Em 2024-05, com
    // três, a API devolvia 1850,63 de 6533,77 — quase R$ 4,7 mil a menos.
    it('soma todos os pagamentos do mês, não só o primeiro', () => {
      const bill = buildBill('2025-03', [
        purchase(-1850.63, 'payment'),
        purchase(-3000, 'payment'),
        purchase(-1683.14, 'payment'),
        purchase(500, 'supermercado'),
      ]);

      assert.equal(bill.valuePaid, 6533.77);
    });

    // Regressão: o CSV do Nubank traz o pagamento negativo e o seed positivo, e
    // a tela mostrava "Valor pago: -R$ 3.538,86".
    it('é uma quantia sem sinal, venha a fonte com qual sinal vier', () => {
      assert.equal(buildBill('2025-03', [purchase(-3538.86, 'payment')]).valuePaid, 3538.86);
      assert.equal(buildBill('2025-03', [purchase(3538.86, 'payment')]).valuePaid, 3538.86);
    });

    it('é zero quando o mês não teve pagamento', () => {
      assert.equal(buildBill('2025-03', [purchase(100, 'casa')]).valuePaid, 0);
    });
  });

  // Regressão: `frequency` usava o total de lançamentos, incluindo a linha de
  // pagamento — a coluna "Compras" da tela vinha sempre com uma compra a mais.
  it('conta só as compras, não o pagamento da fatura', () => {
    const bill = buildBill('2025-03', [
      purchase(100, 'supermercado'),
      purchase(200, 'transporte'),
      purchase(300, 'payment'),
    ]);

    assert.equal(bill.frequency, 2);
    // E bate com a soma das frequências por categoria.
    assert.equal(
      bill.categoriesResult.reduce((acc, c) => acc + c.frequency, 0),
      bill.frequency,
    );
  });

  // Regressão: o /purchase escondia os negativos e este endpoint os somava, então
  // o total da fatura e o total da listagem discordavam sempre que havia estorno.
  describe('estornos', () => {
    it('abatem o gasto do mês', () => {
      const bill = buildBill('2025-03', [
        purchase(100, 'eletrônicos'),
        purchase(-30, 'eletrônicos'),
      ]);

      assert.equal(bill.total, 70);
    });

    it('abatem também dentro da categoria', () => {
      const bill = buildBill('2025-03', [
        purchase(100, 'eletrônicos'),
        purchase(-30, 'eletrônicos'),
        purchase(50, 'transporte'),
      ]);

      assert.equal(bill.total, 120);
      assert.equal(categoria(bill, 'eletrônicos')?.totalCategory, 70);
      // O estorno é um lançamento da categoria, e conta como tal.
      assert.equal(categoria(bill, 'eletrônicos')?.frequency, 2);
    });

    it('não quebram o percentual quando zeram o mês', () => {
      const bill = buildBill('2025-03', [purchase(100, 'casa'), purchase(-100, 'casa')]);

      assert.equal(bill.total, 0);
      assert.equal(categoria(bill, 'casa')?.percentage, 0);
      assert.ok(Number.isFinite(categoria(bill, 'casa')!.percentage));
    });
  });

  it('calcula o percentual de cada categoria e o expõe como chave solta', () => {
    const bill = buildBill('2025-03', [purchase(750, 'viagem'), purchase(250, 'casa')]);

    assert.equal(categoria(bill, 'viagem')?.percentage, 75);
    // A chave solta é o que alimenta as colunas de categoria da tabela.
    assert.equal(bill.viagem, 75);
    assert.equal(bill.casa, 25);
  });

  it('arredonda para dois decimais', () => {
    const bill = buildBill('2025-03', [purchase(10.005, 'outros'), purchase(0.017, 'outros')]);
    assert.equal(bill.total, 10.02);
  });

  it('aguenta um mês só com pagamento, sem nenhum gasto', () => {
    const bill = buildBill('2025-03', [purchase(500, 'payment')]);

    assert.equal(bill.total, 0);
    assert.equal(bill.frequency, 0);
    assert.equal(bill.valuePaid, 500);
    assert.deepEqual(bill.categoriesResult, []);
  });
});

describe('buildBills', () => {
  const FEVEREIRO = new Date(Date.UTC(2025, 1, 1));
  const ABRIL = new Date(Date.UTC(2025, 3, 1));

  it('agrupa por mês de referência em ordem cronológica', () => {
    const bills = buildBills([
      purchase(10, 'outros', ABRIL),
      purchase(20, 'outros', FEVEREIRO),
      purchase(30, 'outros', MARCO),
    ]);

    assert.deepEqual(
      bills.map((b) => b.month),
      ['2025-02', '2025-03', '2025-04'],
    );
  });

  it('usa a data em UTC para a chave do mês', () => {
    // Primeiro instante do mês em UTC: lido em horário local (UTC-3) cairia em
    // janeiro, como já acontecia no gráfico do front.
    const bills = buildBills([purchase(10, 'outros', new Date('2025-02-01T00:00:00.000Z'))]);
    assert.deepEqual(
      bills.map((b) => b.month),
      ['2025-02'],
    );
  });

  it('devolve vazio sem compras', () => {
    assert.deepEqual(buildBills([]), []);
  });

  it('dá a cada fatura a borda do próprio ciclo', () => {
    const bills = buildBills(
      [
        ...billPurchases('2026-05', 6, 26),
        ...billPurchases('2026-06', 6, 26),
        ...billPurchases('2026-07', 6, 26),
      ],
      HOJE,
    );

    assert.deepEqual(
      bills.map((b) => b.cycleEnd),
      ['2026-04-26', '2026-05-26', '2026-06-26'],
    );
  });

  // Regressão: a Visão geral filtrava `month <= mês corrente`, então em 27/07/2026
  // a fatura de agosto caía em "faturas futuras" — mesmo com o ciclo dela, de
  // 26/06 a 26/07, fechado no dia anterior. Um mês inteiro de consumo (R$ 7.245,24
  // e 105 compras na base de referência) saía de todos os números da tela.
  it('fecha o ciclo que terminou, ainda que a fatura vença no mês que vem', () => {
    const bills = buildBills(
      [
        ...billPurchases('2026-06', 6, 26),
        ...billPurchases('2026-07', 6, 26),
        ...billPurchases('2026-08', 6, 26),
        // Setembro só tem parcela lançada à frente: o ciclo dela nem começou.
        ...billPurchases('2026-09', 4, 5),
      ],
      HOJE,
    );

    const hoje = '2026-07-27';
    const porMes = new Map(bills.map((b) => [b.month, b.cycleEnd]));

    assert.equal(porMes.get('2026-08'), '2026-07-26');
    assert.ok(porMes.get('2026-08')! < hoje, 'agosto já fechou');
    assert.ok(porMes.get('2026-09')! > hoje, 'setembro ainda não');
  });
});

describe('inferClosingDay', () => {
  it('lê o dia do fechamento da última compra de cada fatura', () => {
    const purchases = [
      ...billPurchases('2026-05', 6, 26),
      ...billPurchases('2026-06', 6, 26),
      ...billPurchases('2026-07', 6, 26),
    ];

    assert.equal(inferClosingDay(purchases, HOJE), 26);
  });

  // A mediana é o que faz um mês em que ninguém comprou na última semana não
  // arrastar a borda: na base de referência isso acontece: dia 9, dia 12, dia 17.
  it('não deixa um mês que parou de comprar antes puxar a borda', () => {
    const purchases = [
      ...billPurchases('2026-05', 6, 26),
      ...billPurchases('2026-06', 6, 9),
      ...billPurchases('2026-07', 6, 26),
    ];

    assert.equal(inferClosingDay(purchases, HOJE), 26);
  });

  it('ignora fatura pequena, que pode acabar em qualquer dia por acaso', () => {
    const purchases = [
      ...billPurchases('2026-04', 6, 20),
      ...billPurchases('2026-05', 6, 26),
      ...billPurchases('2026-06', 2, 4),
      ...billPurchases('2026-07', 6, 26),
    ];

    // Só as três grandes contam: mediana de [20, 26, 26]. Com a pequena dentro,
    // a mediana de [4, 20, 26, 26] daria 23.
    assert.equal(inferClosingDay(purchases, HOJE), 26);
  });

  // Parcela lançada meses à frente tem data no futuro — a fatura de setembro
  // existe hoje, com quatro linhas de 28/07 a 17/08, e não fechou nada.
  it('ignora fatura cuja última compra ainda está no futuro', () => {
    const purchases = [
      ...billPurchases('2026-04', 6, 20),
      ...billPurchases('2026-05', 6, 26),
      ...billPurchases('2026-07', 6, 26),
      ...billPurchases('2026-09', 6, 5),
    ];

    assert.equal(inferClosingDay(purchases, HOJE), 26);
  });

  it('devolve null quando não há série para inferir', () => {
    assert.equal(inferClosingDay([]), null);
    assert.equal(inferClosingDay(billPurchases('2026-07', 6, 26), HOJE), null);
  });
});

describe('billCycleEnd', () => {
  // O `month` nomeia o vencimento, e o consumo vem do mês anterior.
  it('fecha no mês anterior ao do vencimento', () => {
    assert.equal(billCycleEnd('2026-08', 26), '2026-07-26');
  });

  it('vira o ano em janeiro', () => {
    assert.equal(billCycleEnd('2026-01', 26), '2025-12-26');
  });

  // Sem o limite, o dia 31 em fevereiro rolaria para março e a fatura fecharia
  // depois do próprio vencimento.
  it('não passa do fim de um mês curto', () => {
    assert.equal(billCycleEnd('2026-03', 31), '2026-02-28');
  });

  it('cai no mês calendário quando não há fechamento inferido', () => {
    assert.equal(billCycleEnd('2026-08', null), '2026-07-31');
  });
});
