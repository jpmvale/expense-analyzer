import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AggregatablePurchase, buildBill, buildBills } from './bill-aggregation';

const MARCO = new Date(Date.UTC(2025, 2, 1));

function purchase(
  amount: number,
  category = 'outros',
  referenceMonth = MARCO,
): AggregatablePurchase {
  return { amount, category, referenceMonth };
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
});
