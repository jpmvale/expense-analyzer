import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildUncategorizedTitles, type UncategorizablePurchase } from './uncategorized';

function purchase(
  title: string,
  amount: number,
  date = '2025-03-02',
): UncategorizablePurchase {
  return { title, amount, date: new Date(`${date}T00:00:00.000Z`) };
}

describe('buildUncategorizedTitles', () => {
  it('agrupa por título e soma', () => {
    const [grupo] = buildUncategorizedTitles([
      purchase('LOJA NOVA', 30),
      purchase('LOJA NOVA', 20.5),
    ]);

    assert.equal(grupo.title, 'LOJA NOVA');
    assert.equal(grupo.frequency, 2);
    assert.equal(grupo.total, 50.5);
  });

  // O emissor alterna a caixa do mesmo estabelecimento entre os meses. Sem
  // normalizar, a tela pediria duas classificações para o mesmo lugar.
  it('junta as variações de caixa e acento num grupo só', () => {
    const grupos = buildUncategorizedTitles([
      purchase('Mercadolivre*Mercadol', 30),
      purchase('MERCADOLIVRE*MERCADOL', 20),
      purchase('mercadolivre*mercadol', 10),
    ]);

    assert.equal(grupos.length, 1);
    assert.equal(grupos[0].frequency, 3);
    assert.equal(grupos[0].titles.length, 3);
  });

  // Uma regra `exact` alcança uma grafia só: a tela precisa das outras para
  // saber que uma regra não basta.
  it('devolve as grafias, da mais frequente para a menos', () => {
    const [grupo] = buildUncategorizedTitles([
      purchase('loja k', 10),
      purchase('LOJA K', 10),
      purchase('LOJA K', 10),
    ]);

    assert.equal(grupo.title, 'LOJA K');
    assert.deepEqual(grupo.titles, ['LOJA K', 'loja k']);
  });

  // Na base real são 96 dos 434 títulos sem categoria: uma compra parcelada em
  // cinco chega como cinco estabelecimentos e pediria cinco decisões.
  describe('parcelas', () => {
    it('junta as parcelas do mesmo lugar num grupo só', () => {
      const grupos = buildUncategorizedTitles([
        purchase('Mp *Agptecnologiaemin - Parcela 1/3', 1033),
        purchase('Mp *Agptecnologiaemin - Parcela 2/3', 1033),
        purchase('Mp *Agptecnologiaemin - Parcela 3/3', 1033),
      ]);

      assert.equal(grupos.length, 1);
      assert.equal(grupos[0].title, 'Mp *Agptecnologiaemin');
      assert.equal(grupos[0].frequency, 3);
      assert.equal(grupos[0].total, 3099);
    });

    it('junta a compra à vista com as parcelas dela', () => {
      const grupos = buildUncategorizedTitles([
        purchase('Amazon', 100),
        purchase('Amazon - Parcela 1/3', 779.7),
        purchase('Amazon - Parcela 2/3', 779.7),
      ]);

      assert.equal(grupos.length, 1);
      assert.equal(grupos[0].title, 'Amazon');
    });

    it('não corta um título que só termina em número', () => {
      const grupos = buildUncategorizedTitles([
        purchase('Fisia Nfs2054', 629.98),
        purchase('POSTO 24/7', 100),
      ]);

      assert.deepEqual(new Set(grupos.map((g) => g.title)), new Set(['Fisia Nfs2054', 'POSTO 24/7']));
    });
  });

  describe('regra sugerida', () => {
    it('sugere o título exato quando há uma forma só', () => {
      const [grupo] = buildUncategorizedTitles([purchase('Comercial Ovolar', 30)]);
      assert.deepEqual(grupo.suggestion, { kind: 'exact', value: 'Comercial Ovolar' });
    });

    // Com parcelas ou caixa alternando, `exact` classificaria uma parte e
    // deixaria o resto na lista — o usuário voltaria amanhã para o mesmo lugar.
    it('sugere o trecho quando o grupo tem mais de uma forma', () => {
      const [porParcela] = buildUncategorizedTitles([
        purchase('Amazon - Parcela 1/3', 100),
        purchase('Amazon - Parcela 2/3', 100),
      ]);
      assert.deepEqual(porParcela.suggestion, { kind: 'contains', value: 'Amazon' });

      const [porCaixa] = buildUncategorizedTitles([
        purchase('Mercadolivre*Mercadol', 100),
        purchase('MERCADOLIVRE*MERCADOL', 100),
      ]);
      assert.equal(porCaixa.suggestion.kind, 'contains');
    });
  });

  // A ordem é o que faz a faxina render: classificar o primeiro da lista é o que
  // mais mexe nos gráficos.
  it('ordena pelo dinheiro parado, não pela quantidade', () => {
    const grupos = buildUncategorizedTitles([
      purchase('CAFE DA ESQUINA', 8),
      purchase('CAFE DA ESQUINA', 8),
      purchase('CAFE DA ESQUINA', 8),
      purchase('LATAM AIRLINES', 2600),
    ]);

    assert.deepEqual(
      grupos.map((g) => g.title),
      ['LATAM AIRLINES', 'CAFE DA ESQUINA'],
    );
  });

  // Um título quase todo estornado tem saldo perto de zero e dezenas de
  // lançamentos para classificar. Ordenar com sinal o esconderia no fim.
  it('ordena pelo módulo, para o quase-estornado não sumir', () => {
    const grupos = buildUncategorizedTitles([
      purchase('LOJA ESTORNADA', 3000),
      purchase('LOJA ESTORNADA', -2990),
      purchase('LOJA PEQUENA', 100),
    ]);

    assert.equal(grupos[0].title, 'LOJA PEQUENA');
    assert.equal(grupos[1].total, 10);
  });

  it('guarda a compra mais recente do grupo', () => {
    const [grupo] = buildUncategorizedTitles([
      purchase('LOJA K', 10, '2019-05-02'),
      purchase('LOJA K', 10, '2026-01-08'),
      purchase('LOJA K', 10, '2022-07-15'),
    ]);

    assert.equal(grupo.lastDate.toISOString(), '2026-01-08T00:00:00.000Z');
  });

  it('devolve vazio quando não há nada sem categoria', () => {
    assert.deepEqual(buildUncategorizedTitles([]), []);
  });
});
