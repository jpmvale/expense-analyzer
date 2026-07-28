import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRecurringCharges, stripGateway, type RecurringCandidate } from './recurring';

const HOJE = new Date('2026-07-15T00:00:00.000Z');

/** Uma cobrança por mês a partir de `desde`, com os valores na ordem dada. */
function serie(title: string, desde: string, amounts: number[]): RecurringCandidate[] {
  const [ano, mes] = desde.split('-').map(Number);

  return amounts.map((amount, i) => ({
    title,
    amount,
    date: new Date(Date.UTC(ano, mes - 1 + i, 10)),
  }));
}

/** Repete `amount` por `n` meses. Açúcar para montar patamares legíveis. */
function plato(amount: number, n: number): number[] {
  return Array.from({ length: n }, () => amount);
}

describe('stripGateway', () => {
  it('tira o intermediário e preserva o estabelecimento', () => {
    assert.equal(stripGateway('mp *melimais'), 'melimais');
    assert.equal(stripGateway('ec*melimais'), 'melimais');
    assert.equal(stripGateway('ebanx *spotify'), 'spotify');
  });

  // `Uber *Uber *Trip` chega com dois intermediários empilhados.
  it('repete enquanto houver prefixo', () => {
    assert.equal(stripGateway('uber *uber *trip'), 'trip');
  });

  // Cortar até o último `*` juntaria estabelecimentos diferentes do mesmo app.
  it('preserva o que vem depois do primeiro nome', () => {
    assert.notEqual(stripGateway('ifood *ifd*dominos p'), stripGateway('ifood *ifd*farmacia'));
  });

  it('não mexe em título sem intermediário', () => {
    assert.equal(stripGateway('netflix.com'), 'netflix.com');
  });
});

describe('buildRecurringCharges', () => {
  it('acha o degrau entre dois patamares', () => {
    const [achado] = buildRecurringCharges(
      serie('Netflix.Com', '2025-01', [...plato(39.9, 6), ...plato(44.9, 6)]),
      HOJE,
    );

    assert.equal(achado.current, 44.9);
    assert.equal(achado.previous, 39.9);
    assert.equal(achado.change, 12.53);
    assert.equal(achado.plateaus.length, 2);
  });

  // O gateway muda de nome ao longo dos anos e parte a série em pedaços curtos:
  // sem juntar, nenhum dos dois chega aos seis meses e a escada some.
  it('junta as formas do mesmo estabelecimento sob gateways diferentes', () => {
    const [achado] = buildRecurringCharges(
      [
        ...serie('Ebanx *Spotify', '2025-01', plato(19.9, 5)),
        ...serie('Dm *Spotify', '2025-06', plato(23.9, 5)),
      ],
      HOJE,
    );

    assert.equal(achado.charges, 10);
    assert.equal(achado.titles.length, 2);
    assert.equal(achado.current, 23.9);
    assert.equal(achado.previous, 19.9);
  });

  // A chave é o que um nome formal guardado no banco encontra de volta. Prendê-lo
  // ao título cru perderia o apelido no mês em que o gateway mudasse — e é a
  // mesma chave para as oito formas do Spotify.
  it('dá ao grupo uma chave estável, sem gateway e sem caixa', () => {
    const [achado] = buildRecurringCharges(
      [
        ...serie('Ebanx *Spotify', '2025-01', plato(19.9, 5)),
        ...serie('DM*SPOTIFY', '2025-06', plato(23.9, 5)),
      ],
      HOJE,
    );

    assert.equal(achado.key, 'spotify');
    // O título continua sendo a forma crua mais frequente, para a tela poder
    // mostrar de onde o nome veio.
    assert.equal(achado.titles.length, 2);
  });

  it('separa em chaves diferentes estabelecimentos diferentes', () => {
    const achados = buildRecurringCharges(
      [
        ...serie('Mp *Melimais', '2025-01', plato(19.9, 8)),
        ...serie('Dm *Spotify', '2025-01', plato(23.9, 8)),
      ],
      HOJE,
    );

    assert.deepEqual(new Set(achados.map((c) => c.key)), new Set(['melimais', 'spotify']));
  });

  // O valor oscila sem parar: é fornecedor, não assinatura. Sem esta regra,
  // `Comercial Ovolar` entra com 45 compras e 21 patamares.
  it('ignora série de valor instável, mesmo em cadência mensal', () => {
    const achados = buildRecurringCharges(
      serie('Comercial Ovolar', '2025-01', [21, 23, 27, 28, 25, 23, 28, 27, 25, 24]),
      HOJE,
    );

    assert.deepEqual(achados, []);
  });

  // Uma compra dividida em dez é dez cobranças mensais idênticas — a assinatura
  // mais convincente que existe, e não é uma.
  it('ignora parcelamento', () => {
    const parcelas = plato(183.84, 9).map((amount, i) => ({
      title: `Loja Grande - Parcela ${i + 1}/9`,
      amount,
      date: new Date(Date.UTC(2025, i, 10)),
    }));

    assert.deepEqual(buildRecurringCharges(parcelas, HOJE), []);
  });

  // Duas cobranças por mês é frequência de uso, não assinatura.
  it('ignora quem cobra mais de uma vez por mês', () => {
    const dobradas = plato(39.9, 8).flatMap((amount, i) => [
      { title: 'Ifood *Ifd*Dominos P', amount, date: new Date(Date.UTC(2025, i, 5)) },
      { title: 'Ifood *Ifd*Dominos P', amount, date: new Date(Date.UTC(2025, i, 20)) },
    ]);

    assert.deepEqual(buildRecurringCharges(dobradas, HOJE), []);
  });

  // Uma taxa avulsa antes do preço virar `previous` produzia +1414% em `Sua
  // Academia`, que é o número mais alto da tela e não quer dizer nada.
  it('não usa cobrança solitária como preço anterior', () => {
    const [achado] = buildRecurringCharges(
      serie('Sua Academia', '2025-01', [9.9, ...plato(149.9, 8)]),
      HOJE,
    );

    assert.equal(achado.current, 149.9);
    assert.equal(achado.previous, null);
    assert.equal(achado.change, null);
  });

  // Um lançamento novo e diferente ainda não é reajuste: pode ser avulso.
  it('não trata cobrança solitária no fim como preço novo', () => {
    const [achado] = buildRecurringCharges(
      serie('Google One', '2025-01', [...plato(12.5, 8), 24.99]),
      HOJE,
    );

    assert.equal(achado.current, 12.5);
  });

  it('marca como encerrada a que parou de cobrar', () => {
    const achados = buildRecurringCharges(
      [
        ...serie('Netflix.Com', '2026-01', plato(44.9, 7)),
        ...serie('Itunes.Com/Bill', '2019-01', plato(3.5, 8)),
      ],
      HOJE,
    );

    const netflix = achados.find((a) => a.title === 'Netflix.Com');
    const itunes = achados.find((a) => a.title === 'Itunes.Com/Bill');

    assert.equal(netflix?.active, true);
    assert.equal(itunes?.active, false);
    // A ativa vem primeiro mesmo sem degrau: o que se paga hoje é a notícia.
    assert.equal(achados[0].title, 'Netflix.Com');
  });

  it('reporta queda de preço com a mesma força de uma alta', () => {
    const [achado] = buildRecurringCharges(
      serie('Mp *Melimais', '2025-01', [...plato(24.9, 6), ...plato(19.9, 6)]),
      HOJE,
    );

    assert.equal(achado.change, -20.08);
  });

  it('ignora estorno, que não é preço', () => {
    const achados = buildRecurringCharges(
      serie('Estorno De Netflix', '2025-01', plato(-44.9, 8)),
      HOJE,
    );

    assert.deepEqual(achados, []);
  });

  it('exige série mínima antes de chamar de recorrente', () => {
    assert.deepEqual(buildRecurringCharges(serie('Coisa Nova', '2026-01', plato(10, 5)), HOJE), []);
  });

  it('devolve a escada inteira, não só o último degrau', () => {
    const [achado] = buildRecurringCharges(
      serie('Glx*Srjhon Barbearia', '2025-01', [
        ...plato(68.99, 4),
        ...plato(79.99, 4),
        ...plato(86.99, 4),
      ]),
      HOJE,
    );

    assert.deepEqual(
      achado.plateaus.map((p) => p.amount),
      [68.99, 79.99, 86.99],
    );
    assert.equal(achado.plateaus[2].since.toISOString().slice(0, 7), '2025-09');
  });
});
