import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CategoryMemory, parseBillCsv, referenceMonthFromFileName } from './parseBillCsv';

const MARCO = new Date('2025-03-01T00:00:00.000Z');

function parse(csv: string, memory = new CategoryMemory()) {
  return parseBillCsv(csv, MARCO, memory);
}

describe('parseBillCsv', () => {
  it('lê as colunas e carimba o mês de referência', () => {
    const [purchase] = parse('date,category,title,amount\n2025-02-28,supermercado,CARREFOUR,231.45');

    assert.equal(purchase.title, 'CARREFOUR');
    assert.equal(purchase.category, 'supermercado');
    assert.equal(purchase.amount, 231.45);
    assert.equal(purchase.date.toISOString(), '2025-02-28T00:00:00.000Z');
    // A compra é de fevereiro, mas caiu na fatura de março — é o ponto do campo.
    assert.equal(purchase.referenceMonth.toISOString(), '2025-03-01T00:00:00.000Z');
  });

  it('respeita aspas em títulos com vírgula', () => {
    const [purchase] = parse(
      'date,category,title,amount\n2025-03-02,supermercado,"MERCADO SAO JOAO, LTDA",99.90',
    );
    assert.equal(purchase.title, 'MERCADO SAO JOAO, LTDA');
    assert.equal(purchase.amount, 99.9);
  });

  it('trata aspas duplas escapadas como uma aspa literal', () => {
    const [purchase] = parse('date,category,title,amount\n2025-03-02,lazer,"BAR ""DO ZE""",50');
    assert.equal(purchase.title, 'BAR "DO ZE"');
  });

  it('descarta linhas sem título, sem valor ou com data inválida', () => {
    const purchases = parse(
      [
        'date,category,title,amount',
        '2025-03-02,lazer,,50', // sem título
        '2025-03-03,lazer,CINEMARK,', // sem valor
        '2025-03-04,lazer,CINEMARK,0', // valor zero
        'data-invalida,lazer,CINEMARK,30',
        '2025-03-05,lazer,CINEMARK,30', // única válida
      ].join('\n'),
    );

    assert.equal(purchases.length, 1);
    assert.equal(purchases[0].amount, 30);
  });

  it('devolve vazio para um CSV sem linhas', () => {
    assert.deepEqual(parse(''), []);
  });

  describe('categorização', () => {
    it('herda a categoria de um título já categorizado adiante no arquivo', () => {
      const purchases = parse(
        [
          'date,category,title,amount',
          '2025-03-02,,UBER TRIP,20', // ainda sem categoria
          '2025-03-03,transporte,UBER TRIP,25', // categorizada aqui
        ].join('\n'),
      );

      assert.deepEqual(
        purchases.map((p) => p.category),
        ['transporte', 'transporte'],
      );
    });

    it('compartilha a memória entre faturas de uma mesma execução', () => {
      const memory = new CategoryMemory();
      parse('date,category,title,amount\n2025-03-02,eletrônicos,KABUM,300', memory);
      const [purchase] = parse('date,category,title,amount\n2025-03-09,,KABUM,150', memory);

      assert.equal(purchase.category, 'eletrônicos');
    });

    it('cai em palavra-chave quando o título é desconhecido', () => {
      const [purchase] = parse('date,category,title,amount\n2025-03-02,,UBER *TRIP HELP,20');
      assert.equal(purchase.category, 'transporte');
    });

    it('cai em "outros" quando nada bate', () => {
      const [purchase] = parse('date,category,title,amount\n2025-03-02,,LOJA DESCONHECIDA,20');
      assert.equal(purchase.category, 'outros');
    });
  });
});

describe('referenceMonthFromFileName', () => {
  it('extrai o mês do nome do arquivo, em UTC', () => {
    assert.equal(
      referenceMonthFromFileName('nubank-2024-03.csv')?.toISOString(),
      '2024-03-01T00:00:00.000Z',
    );
  });

  it('não depende do prefixo do nome', () => {
    assert.equal(
      referenceMonthFromFileName('fatura_2024-11.csv')?.toISOString(),
      '2024-11-01T00:00:00.000Z',
    );
  });

  it('devolve null quando o nome não traz <ano>-<mês>', () => {
    assert.equal(referenceMonthFromFileName('fatura-marco.csv'), null);
  });
});
