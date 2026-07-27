import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Bill from '../interface/bill';
import { buildCategoryExpectations } from './categoryExpectation';

/** O ciclo da fatura fecha no mês anterior ao do vencimento. */
function cycleEnd(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 2, 26)).toISOString().slice(0, 10);
}

function bill(month: string, categories: Record<string, number>): Bill {
  return {
    month,
    cycleEnd: cycleEnd(month),
    valuePaid: 0,
    total: Object.values(categories).reduce((acc, value) => acc + value, 0),
    charges: 0,
    frequency: Object.keys(categories).length,
    categoriesResult: Object.entries(categories).map(([categoryByMonth, totalCategory]) => ({
      categoryByMonth,
      totalCategory,
      frequency: 1,
      percentage: 0,
    })),
  };
}

/** Doze meses de histórico com os valores dados, mais o mês avaliado no fim. */
function historia(categoria: string, anteriores: number[], atual: number): Bill[] {
  const meses = [...anteriores, atual];
  return meses.map((valor, i) =>
    bill(`2025-${String(i + 1).padStart(2, '0')}`, valor === 0 ? {} : { [categoria]: valor }),
  );
}

/** Doze meses estáveis em torno de `base`, oscilando de leve. */
function estavel(base: number): number[] {
  return Array.from({ length: 12 }, (_, i) => base + (i % 3) * (base * 0.05));
}

describe('buildCategoryExpectations', () => {
  it('não opina sem janela cheia', () => {
    const poucos = historia('restaurante', [500, 520, 480], 4000).slice(0, 4);
    assert.deepEqual(buildCategoryExpectations(poucos), []);
  });

  it('acusa o mês que fugiu do normal', () => {
    const [achado] = buildCategoryExpectations(historia('Amazon', estavel(300), 1100));

    assert.equal(achado.category, 'Amazon');
    assert.equal(achado.current, 1100);
    assert.ok(achado.difference > 700);
    assert.ok(achado.deviations > 2.5);
  });

  // O mês avaliado não pode entrar no próprio referencial.
  it('calcula a referência sem o mês avaliado', () => {
    const [achado] = buildCategoryExpectations(historia('Amazon', Array(12).fill(300), 1100));
    assert.equal(achado.baseline, 300);
  });

  // Um limiar percentual acusaria estas; elas são a oscilação normal da própria
  // categoria, e foi por isso que o corte deixou de ser em percentual.
  it('ignora oscilação grande em categoria naturalmente errática', () => {
    const erratica = [50, 900, 120, 800, 60, 1000, 300, 700, 90, 850, 200, 600];
    assert.deepEqual(buildCategoryExpectations(historia('lazer', erratica, 1200)), []);
  });

  // Percentual sozinho mente na escala pequena.
  it('ignora desvio pequeno em reais, por maior que seja o percentual', () => {
    const achados = buildCategoryExpectations(historia('café', estavel(12), 60));
    assert.deepEqual(achados, []);
  });

  // Comparar contra quem aparece de vez em quando produz alarme toda compra.
  it('ignora categoria sem histórico suficiente', () => {
    const esporadica = [0, 0, 0, 0, 0, 0, 0, 0, 900, 0, 0, 0];
    assert.deepEqual(buildCategoryExpectations(historia('viagem', esporadica, 2600)), []);
  });

  // Deixar de gastar é tão informativo quanto gastar demais.
  it('acusa também a queda', () => {
    const [achado] = buildCategoryExpectations(historia('Combustível', estavel(160), 0));

    assert.ok(achado.difference < 0);
    assert.ok(achado.deviations < -2.5);
    assert.equal(achado.current, 0);
  });

  // Uma viagem isolada levantaria a média do ano e esconderia o mês anômalo.
  it('usa mediana, que um pico isolado não desloca', () => {
    const comPico = [200, 200, 200, 200, 200, 2600, 200, 200, 200, 200, 200, 200];
    const [achado] = buildCategoryExpectations(historia('transporte', comPico, 600));

    assert.equal(achado.baseline, 200);
  });

  // Dispersão zero: a mensalidade que nunca mudou e mudou.
  it('trata categoria perfeitamente previsível que se move', () => {
    const [achado] = buildCategoryExpectations(historia('Academia', Array(12).fill(400), 0));

    assert.equal(achado.baseline, 400);
    assert.equal(achado.difference, -400);
    assert.equal(achado.deviations, Number.NEGATIVE_INFINITY);
  });

  it('ordena por dinheiro, não por desvio', () => {
    const meses = Array.from({ length: 13 }, (_, i) =>
      bill(`2025-${String(i + 1).padStart(2, '0')}`, {
        grande: 500 + (i % 3) * 25,
        pequena: 200 + (i % 3) * 10,
      }),
    );
    // No último mês: `pequena` triplica (desvio maior), `grande` sobe mais em reais.
    meses[12] = bill('2026-01', { grande: 1400, pequena: 620 });

    const achados = buildCategoryExpectations(meses);
    assert.equal(achados[0].category, 'grande');
    assert.ok(Math.abs(achados[0].difference) > Math.abs(achados[1].difference));
  });

  it('devolve percentual nulo quando não havia base', () => {
    const metade = [0, 300, 0, 300, 0, 300, 0, 300, 0, 300, 0, 300];
    const achados = buildCategoryExpectations(historia('Farmácia', metade, 1200));

    for (const achado of achados) {
      if (achado.baseline === 0) assert.equal(achado.change, null);
    }
  });
});
