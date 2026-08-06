import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { billsFromCsvFiles } from './csvFiles';
import { collectingLogger } from './logger';

/** Uma fatura com uma compra por linha, no formato que o emissor exporta. */
function csv(rows: [date: string, title: string, category?: string][]): string {
  return [
    'date,category,title,amount',
    ...rows.map(([date, title, category = 'transporte']) => `${date},${category},${title},10.00`),
  ].join('\n');
}

describe('billsFromCsvFiles', () => {
  it('tira o mês do nome do arquivo quando ele traz <ano>-<mês>', () => {
    const { logger } = collectingLogger();

    const { bills, files } = billsFromCsvFiles(
      [{ name: 'nubank-2026-03.csv', content: csv([['2026-03-10', 'Uber']]) }],
      logger,
    );

    assert.equal(bills[0].referenceMonth.toISOString(), '2026-03-01T00:00:00.000Z');
    assert.deepEqual(files[0], {
      name: 'nubank-2026-03.csv',
      month: '2026-03',
      monthFrom: 'filename',
      purchases: 1,
      discarded: 0,
    });
  });

  it('sem inferência, ignora o arquivo cujo nome não traz o padrão', () => {
    const { logger, lines } = collectingLogger();

    const { bills, files } = billsFromCsvFiles(
      [{ name: 'fatura (3).csv', content: csv([['2026-03-10', 'Uber']]) }],
      logger,
    );

    assert.deepEqual(bills, []);
    assert.equal(files[0].month, null);
    assert.match(files[0].skipped ?? '', /<ano>-<mês>/);
    assert.match(lines.join('\n'), /Ignorando "fatura \(3\)\.csv"/);
  });

  // O caso do upload: quem baixou a fatura do app do banco não deve precisar
  // renomear o arquivo para conseguir importá-la.
  it('com inferência, tira o mês das datas de dentro do arquivo', () => {
    const { logger } = collectingLogger();

    const { bills, files } = billsFromCsvFiles(
      [
        {
          name: 'fatura (3).csv',
          content: csv([
            // A compra do fim do mês anterior não pode decidir sozinha: o mês da
            // fatura é o majoritário, não o mais antigo.
            ['2026-02-27', 'Padaria'],
            ['2026-03-10', 'Uber'],
            ['2026-03-12', 'Mercado'],
          ]),
        },
      ],
      logger,
      { inferMonthFromContent: true },
    );

    assert.equal(bills[0].referenceMonth.toISOString(), '2026-03-01T00:00:00.000Z');
    assert.equal(files[0].monthFrom, 'content');
    assert.equal(files[0].month, '2026-03');
  });

  it('o nome ganha do conteúdo quando os dois dizem algo', () => {
    const { logger } = collectingLogger();

    const { files } = billsFromCsvFiles(
      [{ name: 'nubank-2026-04.csv', content: csv([['2026-03-10', 'Uber']]) }],
      logger,
      { inferMonthFromContent: true },
    );

    assert.equal(files[0].month, '2026-04');
    assert.equal(files[0].monthFrom, 'filename');
  });

  /**
   * A razão de a ordem existir: a memória de categorização só propaga para a
   * frente. Com os arquivos chegando fora de ordem, a fatura antiga tem de ser
   * processada primeiro, senão o mês sem categoria não herda nada.
   */
  it('processa em ordem cronológica, não na ordem em que os arquivos chegaram', () => {
    const { logger } = collectingLogger();

    const { bills } = billsFromCsvFiles(
      [
        // Chega primeiro, mas é o mês mais novo — e vem sem categoria.
        { name: 'nubank-2026-04.csv', content: csv([['2026-04-10', 'Mercadolivre', '']]) },
        { name: 'nubank-2026-03.csv', content: csv([['2026-03-10', 'Mercadolivre', 'compras']]) },
      ],
      logger,
    );

    const [marco, abril] = bills;
    assert.equal(marco.data[0].sourceCategory, 'compras');
    assert.equal(abril.data[0].sourceCategory, 'compras');
  });

  it('conta as linhas descartadas e avisa sobre elas', () => {
    const { logger, lines } = collectingLogger();

    const { files } = billsFromCsvFiles(
      [
        {
          name: 'nubank-2026-03.csv',
          content: ['date,category,title,amount', '2026-03-10,transporte,Uber,10.00', ',,,'].join(
            '\n',
          ),
        },
      ],
      logger,
    );

    assert.equal(files[0].purchases, 1);
    assert.equal(files[0].discarded, 1);
    assert.match(lines.join('\n'), /1 linha ignorada/);
  });
});
