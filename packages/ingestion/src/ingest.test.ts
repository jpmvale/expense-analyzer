import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CategoryRule } from '@expense/categorization';
import { ingestBills, type BillStore } from './ingest';
import type { Bill } from './interfaces/bill';
import type { Purchase } from './interfaces/purchase';
import { collectingLogger } from './logger';

function month(value: string): Date {
  return new Date(`${value}-01T00:00:00.000Z`);
}

function purchase(title: string, category: string, referenceMonth: string): Purchase {
  return {
    title,
    amount: 100,
    date: new Date(`${referenceMonth}-10T00:00:00.000Z`),
    category,
    sourceCategory: category,
    referenceMonth: month(referenceMonth),
  };
}

function bill(referenceMonth: string, data: Purchase[]): Bill {
  return { referenceMonth: month(referenceMonth), data };
}

/**
 * Um `BillStore` em memória que registra a ordem das chamadas.
 *
 * O que se testa aqui é a coreografia — apaga o mês, grava, reaplica — e não a
 * escrita no Mongo, que os testes de serviço da API já exercitam contra um banco
 * de verdade. O `reapplyRules` que roda por baixo é o real, não um duplo: a
 * pergunta que este arquivo responde é se ele é chamado no momento certo e sobre
 * o estado certo.
 */
function memoryStore(rules: CategoryRule[] = []) {
  const saved: Purchase[] = [];
  const calls: string[] = [];
  const writable = (p: Purchase, titles: string[]) =>
    titles.includes(p.title) && p.sourceCategory !== 'payment';

  const store: BillStore = {
    async replaceMonth(incoming) {
      calls.push(`replaceMonth:${incoming.referenceMonth.toISOString().slice(0, 7)}`);
      for (let i = saved.length - 1; i >= 0; i--) {
        if (+saved[i].referenceMonth === +incoming.referenceMonth) saved.splice(i, 1);
      }
      saved.push(...incoming.data.map((p) => ({ ...p })));
    },
    async backfillSourceCategory() {
      calls.push('backfill');
      return 0;
    },
    async loadRules() {
      calls.push('loadRules');
      return rules;
    },
    purchases: {
      async distinctTitles() {
        calls.push('reapply');
        return [...new Set(saved.filter((p) => p.sourceCategory !== 'payment').map((p) => p.title))];
      },
      async setCategoryForTitles(titles, category) {
        let changed = 0;
        for (const p of saved) {
          if (writable(p, titles) && p.category !== category) {
            p.category = category;
            changed++;
          }
        }
        return changed;
      },
      async restoreSourceCategory(titles) {
        let changed = 0;
        for (const p of saved) {
          if (writable(p, titles) && p.category !== p.sourceCategory) {
            p.category = p.sourceCategory;
            changed++;
          }
        }
        return changed;
      },
      async titlesWithSourceCategory(category) {
        return [...new Set(saved.filter((p) => p.sourceCategory === category).map((p) => p.title))];
      },
    },
  };

  return { store, saved, calls };
}

describe('ingestBills', () => {
  it('grava cada fatura e conta as compras', async () => {
    const { store, saved } = memoryStore();
    const { logger } = collectingLogger();

    const result = await ingestBills(
      [
        bill('2026-02', [purchase('Uber', 'transporte', '2026-02')]),
        bill('2026-03', [
          purchase('Uber', 'transporte', '2026-03'),
          purchase('Padaria', 'restaurante', '2026-03'),
        ]),
      ],
      store,
      logger,
    );

    assert.equal(result.bills, 2);
    assert.equal(result.purchases, 3);
    assert.equal(saved.length, 3);
  });

  it('regravar o mesmo mês sobrescreve, em vez de duplicar', async () => {
    const { store, saved } = memoryStore();
    const { logger } = collectingLogger();

    await ingestBills([bill('2026-03', [purchase('Uber', 'transporte', '2026-03')])], store, logger);
    await ingestBills(
      [
        bill('2026-03', [
          purchase('Uber', 'transporte', '2026-03'),
          purchase('Padaria', 'restaurante', '2026-03'),
        ]),
      ],
      store,
      logger,
    );

    assert.equal(saved.length, 2);
  });

  /**
   * O ponto do sistema inteiro: a gravação apaga o mês e devolve as categorias
   * do emissor, e é a reaplicação depois dela que traz de volta o que a pessoa
   * classificou na tela. Sem esta ordem, sincronizar desfaria o trabalho manual.
   */
  it('reaplica as regras do usuário sobre o que a fatura acabou de sobrescrever', async () => {
    const { store, saved } = memoryStore([
      { kind: 'exact', value: 'Mercadolivre*Mercadol', category: 'mercado livre' },
    ]);
    const { logger } = collectingLogger();

    const result = await ingestBills(
      [bill('2026-03', [purchase('Mercadolivre*Mercadol', 'eletrônicos', '2026-03')])],
      store,
      logger,
    );

    assert.equal(result.classified, 1);
    assert.equal(saved[0].category, 'mercado livre');
    // A categoria do emissor continua guardada ao lado: é para onde a compra
    // volta se a regra for apagada depois.
    assert.equal(saved[0].sourceCategory, 'eletrônicos');
  });

  it('reaplica na ordem: grava tudo, depois redecide', async () => {
    const { store, calls } = memoryStore();
    const { logger } = collectingLogger();

    await ingestBills(
      [
        bill('2026-02', [purchase('Uber', 'transporte', '2026-02')]),
        bill('2026-03', [purchase('Uber', 'transporte', '2026-03')]),
      ],
      store,
      logger,
    );

    assert.deepEqual(calls, [
      'replaceMonth:2026-02',
      'replaceMonth:2026-03',
      'backfill',
      'loadRules',
      'reapply',
    ]);
  });

  /**
   * A reaplicação deixou de ser só sobre regras quando passou a redecidir a
   * camada de encargo. Pular por não haver regra nenhuma faria um mês lido
   * isolado ficar com a lista de palavras-chave do dia em que foi extraído.
   */
  it('reaplica mesmo sem nenhuma regra cadastrada', async () => {
    const { store, calls, saved } = memoryStore([]);
    const { logger } = collectingLogger();

    const result = await ingestBills(
      [bill('2026-03', [purchase('Juros de parcelamento', 'outros', '2026-03')])],
      store,
      logger,
    );

    assert.ok(calls.includes('reapply'));
    assert.equal(saved[0].category, 'encargos');
    assert.equal(result.financing, 1);
  });

  it('sem fatura nenhuma, não toca no banco', async () => {
    const { store, calls } = memoryStore();
    const { logger, lines } = collectingLogger();

    const result = await ingestBills([], store, logger);

    assert.deepEqual(calls, []);
    assert.deepEqual(result, {
      bills: 0,
      purchases: 0,
      rules: 0,
      classified: 0,
      restored: 0,
      financing: 0,
    });
    assert.ok(lines.some((line) => line.includes('Nenhuma fatura encontrada')));
  });
});
