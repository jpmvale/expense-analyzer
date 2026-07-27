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

    // Regressão: a memória guardava um conjunto de títulos por categoria e
    // devolvia a primeira que contivesse o título — um desempate arbitrário,
    // decidido pela ordem de leitura. "Amazon" tem 144 lançamentos como
    // eletrônicos e 1 como vestuário; o único bastava para vencer se viesse antes.
    it('vence a categoria mais frequente, não a primeira vista', () => {
      const memory = new CategoryMemory();
      parse(
        [
          'date,category,title,amount',
          '2025-03-01,vestuário,AMAZON,50', // minoria, mas vem primeiro
          '2025-03-02,eletrônicos,AMAZON,50',
          '2025-03-03,eletrônicos,AMAZON,50',
        ].join('\n'),
        memory,
      );
      const [purchase] = parse('date,category,title,amount\n2025-04-02,,AMAZON,80', memory);

      assert.equal(purchase.category, 'eletrônicos');
    });

    it('conta as ocorrências ao longo de várias faturas', () => {
      const memory = new CategoryMemory();
      parse('date,category,title,amount\n2025-01-02,supermercado,LOJA K,10', memory);
      parse('date,category,title,amount\n2025-02-02,casa,LOJA K,10', memory);
      parse('date,category,title,amount\n2025-03-02,casa,LOJA K,10', memory);
      const [purchase] = parse('date,category,title,amount\n2025-04-02,,LOJA K,10', memory);

      assert.equal(purchase.category, 'casa');
    });

    // Empate é real: "Mercadolivre*Mercadol" tem uma ocorrência em cada uma de
    // três categorias. Vence a mais recente — se o estabelecimento mudou de
    // natureza, a classificação de agora vale mais que a antiga.
    it('desempata pela ocorrência mais recente', () => {
      const memory = new CategoryMemory();
      parse('date,category,title,amount\n2024-01-02,supermercado,LOJA M,10', memory);
      parse('date,category,title,amount\n2025-06-02,restaurante,LOJA M,10', memory);
      const [purchase] = parse('date,category,title,amount\n2025-07-02,,LOJA M,10', memory);

      assert.equal(purchase.category, 'restaurante');
    });

    it('a recência não atropela a frequência', () => {
      const memory = new CategoryMemory();
      parse(
        [
          'date,category,title,amount',
          '2024-01-02,eletrônicos,LOJA N,10',
          '2024-02-02,eletrônicos,LOJA N,10',
          '2024-03-02,eletrônicos,LOJA N,10',
        ].join('\n'),
        memory,
      );
      // Uma ocorrência recente e solitária não derruba três anteriores.
      parse('date,category,title,amount\n2025-06-02,vestuário,LOJA N,10', memory);
      const [purchase] = parse('date,category,title,amount\n2025-07-02,,LOJA N,10', memory);

      assert.equal(purchase.category, 'eletrônicos');
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

    it('casa palavra-chave sem depender de acento ou caixa', () => {
      const [zeDelivery] = parse('date,category,title,amount\n2025-03-02,,Zé Delivery - NuPay,30');
      assert.equal(zeDelivery.category, 'restaurante');

      const [farmacia] = parse('date,category,title,amount\n2025-03-02,,FARMÁCIA CENTRAL,30');
      assert.equal(farmacia.category, 'saúde');
    });

    it('a memória tem precedência sobre a palavra-chave', () => {
      const memory = new CategoryMemory();
      // "Google" bateria em `serviços` por palavra-chave, mas o histórico do
      // usuário diz outra coisa — e o histórico dele sabe mais.
      parse('date,category,title,amount\n2025-03-02,educação,Google Cursos,50', memory);
      const [purchase] = parse('date,category,title,amount\n2025-04-02,,Google Cursos,50', memory);

      assert.equal(purchase.category, 'educação');
    });
  });

  // O emissor parou de categorizar em jul/2024 e passou a carimbar `outros` em
  // quase tudo. Como `outros` é string não-vazia, ele curto-circuitava o `||` e
  // desligava a herança por título justamente quando ela virou indispensável.
  describe('"outros" tratado como ausência de categoria', () => {
    it('herda de um título categorizado numa fatura anterior', () => {
      const memory = new CategoryMemory();
      parse('date,category,title,amount\n2024-06-02,supermercado,MIX MATEUS,150', memory);
      const [purchase] = parse(
        'date,category,title,amount\n2024-07-02,outros,MIX MATEUS,180',
        memory,
      );

      assert.equal(purchase.category, 'supermercado');
    });

    it('cai na palavra-chave quando o título é novo', () => {
      const [purchase] = parse('date,category,title,amount\n2025-03-02,outros,Ifd*Pampas Real,45');
      assert.equal(purchase.category, 'restaurante');
    });

    it('continua "outros" quando não há de onde inferir', () => {
      const [purchase] = parse('date,category,title,amount\n2025-03-02,outros,LOJA NOVA XYZ,45');
      assert.equal(purchase.category, 'outros');
    });

    // Um `outros` carimbado pelo emissor não é informação: deixá-lo entrar na
    // memória travaria o título em `outros` para sempre.
    it('não entra na memória de categorização', () => {
      const memory = new CategoryMemory();
      parse('date,category,title,amount\n2024-07-02,outros,MIX MATEUS,180', memory);
      const [purchase] = parse(
        'date,category,title,amount\n2024-08-02,supermercado,MIX MATEUS,150',
        memory,
      );

      assert.equal(purchase.category, 'supermercado');
    });
  });

  // O Nubank mistura códigos internos de transação no campo categoria. Eles vazavam
  // crus para a tela, cada variação virando uma coluna própria e uma fatia na pizza.
  describe('códigos internos do Nubank', () => {
    function categoriaDe(codigo: string) {
      return parse(`date,category,title,amount\n2025-03-02,${codigo},LOJA X,20`)[0].category;
    }

    it('agrupa toda a família reversal_* em "estorno"', () => {
      for (const codigo of [
        'reversal_brazil_settled',
        'reversal_brazil_due',
        'reversal_foreign_settled',
        'reversal_upfront_national_settled',
        'reversal_upfront_national_due',
      ]) {
        assert.equal(categoriaDe(codigo), 'estorno', codigo);
      }
    });

    it('traduz tax_* e bnpl_*', () => {
      assert.equal(categoriaDe('tax_foreign'), 'impostos');
      assert.equal(categoriaDe('bnpl_transaction_upfront_national'), 'parcelado');
    });

    it('não toca nas categorias de verdade', () => {
      for (const categoria of ['supermercado', 'eletrônicos', 'saúde', 'outros', 'payment']) {
        assert.equal(categoriaDe(categoria), categoria);
      }
    });

    // Um código descreve o tipo da transação, não o estabelecimento: sem isto, uma
    // loja que teve um estorno viraria "estorno" nos meses sem categoria.
    // O título aqui é neutro de propósito — não casa com nenhuma palavra-chave.
    it('não entram na memória de categorização', () => {
      const memory = new CategoryMemory();
      parse('date,category,title,amount\n2025-03-02,reversal_brazil_settled,LOJA ZZZ,-20', memory);
      const [purchase] = parse('date,category,title,amount\n2025-03-09,,LOJA ZZZ,18', memory);

      assert.notEqual(purchase.category, 'estorno');
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
