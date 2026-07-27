import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reapplyRules, type PurchaseStore } from './reapply';
import type { CategoryRule } from './rules';

/** Store de mentira: guarda as chamadas para a ordem e o agrupamento aparecerem. */
function fakeStore(titles: string[]) {
  const writes: Array<{ category: string; titles: string[] }> = [];
  const restores: string[][] = [];

  const store: PurchaseStore = {
    distinctTitles: async () => titles,
    setCategoryForTitles: async (t, category) => {
      writes.push({ category, titles: t });
      return t.length;
    },
    restoreSourceCategory: async (t) => {
      restores.push(t);
      return t.length;
    },
  };

  return { store, writes, restores };
}

const REGRAS: CategoryRule[] = [
  { kind: 'contains', value: 'mercadolivre', category: 'mercado livre' },
  { kind: 'exact', value: 'UBER *TRIP', category: 'transporte' },
];

describe('reapplyRules', () => {
  it('escreve uma vez por categoria, não uma vez por título', async () => {
    const { store, writes } = fakeStore([
      'Mercadolivre*Mercadol',
      'Mercadolivre*Mercadoli',
      'MERCADOLIVRE*MERCADOLIV',
      'UBER *TRIP',
    ]);

    await reapplyRules(store, REGRAS);

    assert.equal(writes.length, 2);
    assert.equal(writes.find((w) => w.category === 'mercado livre')?.titles.length, 3);
  });

  // Sem isto, apagar uma regra deixaria a categoria dela grudada nas compras.
  it('devolve à ingestão os títulos que regra nenhuma alcança', async () => {
    const { store, restores } = fakeStore(['UBER *TRIP', 'PADARIA BELA VISTA', 'LOJA NOVA']);

    const resultado = await reapplyRules(store, REGRAS);

    assert.deepEqual(restores, [['PADARIA BELA VISTA', 'LOJA NOVA']]);
    assert.equal(resultado.restored, 2);
    assert.equal(resultado.classified, 1);
  });

  it('sem regra nenhuma, devolve a base inteira à ingestão', async () => {
    const { store, writes, restores } = fakeStore(['UBER *TRIP', 'IFOOD']);

    await reapplyRules(store, []);

    assert.equal(writes.length, 0);
    assert.deepEqual(restores, [['UBER *TRIP', 'IFOOD']]);
  });

  it('não vai ao banco quando não há o que restaurar', async () => {
    const { store, restores } = fakeStore(['UBER *TRIP']);

    await reapplyRules(store, REGRAS);

    assert.deepEqual(restores, []);
  });

  // A segunda passada tem que decidir igual à primeira: é o que garante que
  // rodar de novo depois de um `pnpm extract` não mexa em nada.
  it('é idempotente', async () => {
    const titles = ['Mercadolivre*Mercadol', 'UBER *TRIP', 'LOJA NOVA'];
    const primeira = fakeStore(titles);
    const segunda = fakeStore(titles);

    await reapplyRules(primeira.store, REGRAS);
    await reapplyRules(segunda.store, REGRAS);

    assert.deepEqual(primeira.writes, segunda.writes);
    assert.deepEqual(primeira.restores, segunda.restores);
  });
});
