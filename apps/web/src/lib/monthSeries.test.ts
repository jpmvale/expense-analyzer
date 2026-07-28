import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fillMonthGaps } from './monthSeries';

const ponto = (month: string, total = 10, count = 1) => ({ month, total, count });

describe('fillMonthGaps', () => {
  it('devolve vazio sem pontos', () => {
    assert.deepEqual(fillMonthGaps([]), []);
  });

  it('preenche com zero os meses sem nenhuma compra', () => {
    const serie = fillMonthGaps([ponto('2025-01'), ponto('2025-04')]);

    assert.deepEqual(
      serie.map((p) => p.month),
      ['2025-01', '2025-02', '2025-03', '2025-04'],
    );
    assert.deepEqual(
      serie.map((p) => p.total),
      [10, 0, 0, 10],
    );
  });

  // Regressão: o preenchimento ia até `new Date()`, então um recorte antigo
  // ganhava uma cauda de barras vazias até o mês corrente.
  it('termina no último mês com dado, não no mês corrente', () => {
    const serie = fillMonthGaps([ponto('2020-01'), ponto('2020-02')]);

    assert.deepEqual(
      serie.map((p) => p.month),
      ['2020-01', '2020-02'],
    );
  });

  it('atravessa a virada de ano', () => {
    const serie = fillMonthGaps([ponto('2025-11'), ponto('2026-02')]);

    assert.deepEqual(
      serie.map((p) => p.month),
      ['2025-11', '2025-12', '2026-01', '2026-02'],
    );
  });

  it('preserva os valores que vieram da API', () => {
    const serie = fillMonthGaps([ponto('2025-03', 1234.56, 7)]);

    assert.deepEqual(serie, [{ month: '2025-03', total: 1234.56, count: 7 }]);
  });

  it('não depende da ordem em que os pontos chegam', () => {
    const serie = fillMonthGaps([ponto('2025-03'), ponto('2025-01')]);

    assert.deepEqual(
      serie.map((p) => p.month),
      ['2025-01', '2025-02', '2025-03'],
    );
  });
});
