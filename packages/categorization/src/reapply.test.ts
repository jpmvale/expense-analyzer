import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reapplyRules, type PurchaseStore } from './reapply';
import type { CategoryRule } from './rules';

/**
 * Store de mentira: guarda as chamadas para a ordem e o agrupamento aparecerem.
 *
 * `ingestedAsFinancing` são os títulos que a ingestão tinha resolvido como
 * encargo — é o que permite testar o caminho de *sair* de `encargos`.
 */
function fakeStore(titles: string[], ingestedAsFinancing: string[] = []) {
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
    titlesWithSourceCategory: async (category) =>
      category === 'encargos' ? ingestedAsFinancing : [],
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

  // Encargo é a única palavra-chave que a reaplicação redecide, porque é a única
  // que muda quanto se gastou. Sem isto, corrigir a lista só valia a partir do
  // próximo `pnpm extract` — inalcançável para quem não tem mais os CSVs.
  describe('camada de encargo', () => {
    it('manda para encargos o título que a lista de agora reconhece', async () => {
      const { store, writes, restores } = fakeStore(['Multa de atraso', 'PADARIA BELA VISTA']);

      const resultado = await reapplyRules(store, []);

      assert.deepEqual(writes, [{ category: 'encargos', titles: ['Multa de atraso'] }]);
      assert.deepEqual(restores, [['PADARIA BELA VISTA']]);
      assert.equal(resultado.financing, 1);
      // Não é trabalho de regra, e não conta como tal.
      assert.equal(resultado.classified, 0);
    });

    // Devolver à ingestão devolveria a `encargos`, que é justamente o que se quer
    // desfazer: `sourceCategory` está congelada.
    it('tira de encargos o título que a lista de agora não reconhece mais', async () => {
      // `juros rotativo` não casa com nenhuma palavra da tabela — `juros de`, que
      // existe, exige o "de". Uma ingestão antiga com outra lista o teria posto em
      // `encargos`, e é de lá que ele precisa sair.
      const stale = ['Juros rotativo'];
      const { store, writes, restores } = fakeStore(stale, stale);

      const resultado = await reapplyRules(store, []);

      // Nada devolvido à ingestão, que insistiria em `encargos`: refez a inferência.
      assert.deepEqual(restores, []);
      assert.deepEqual(writes, [{ category: 'outros', titles: ['Juros rotativo'] }]);
      assert.equal(resultado.financing, 1);
    });

    // Ao sair de encargos, o título passa pela tabela inteira outra vez — e não
    // direto para `outros`.
    it('ao sair de encargos, refaz a inferência pela tabela toda', async () => {
      const { store, writes } = fakeStore(['Posto Shell Centro'], ['Posto Shell Centro']);

      await reapplyRules(store, []);

      assert.deepEqual(writes, [{ category: 'transporte', titles: ['Posto Shell Centro'] }]);
    });

    // A regra do usuário ganha da tabela, aqui como em todo lugar: é o que permite
    // dizer que uma anuidade específica é um serviço, e não um encargo.
    it('deixa a regra do usuário ganhar do encargo', async () => {
      const { store, writes } = fakeStore(['Anuidade Cartão']);

      const resultado = await reapplyRules(store, [
        { kind: 'exact', value: 'Anuidade Cartão', category: 'serviços' },
      ]);

      assert.deepEqual(writes, [{ category: 'serviços', titles: ['Anuidade Cartão'] }]);
      assert.equal(resultado.classified, 1);
      assert.equal(resultado.financing, 0);
    });

    it('não pergunta ao banco quando não há candidato a sair de encargos', async () => {
      const consultas: string[] = [];
      const store: PurchaseStore = {
        distinctTitles: async () => ['Multa de atraso'],
        setCategoryForTitles: async (t) => t.length,
        restoreSourceCategory: async (t) => t.length,
        titlesWithSourceCategory: async (category) => {
          consultas.push(category);
          return [];
        },
      };

      await reapplyRules(store, []);

      assert.deepEqual(consultas, []);
    });

    it('continua idempotente com encargo no meio', async () => {
      const titles = ['Saldo em atraso', 'Juros rotativo', 'LOJA NOVA'];
      const primeira = fakeStore(titles, ['Juros rotativo']);
      const segunda = fakeStore(titles, ['Juros rotativo']);

      await reapplyRules(primeira.store, REGRAS);
      await reapplyRules(segunda.store, REGRAS);

      assert.deepEqual(primeira.writes, segunda.writes);
      assert.deepEqual(primeira.restores, segunda.restores);
    });
  });
});
