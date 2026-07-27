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
