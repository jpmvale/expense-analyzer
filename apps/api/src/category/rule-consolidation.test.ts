import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CategoryRule } from '@expense/categorization';
import { suggestConsolidations, type RuledTitle } from './rule-consolidation';

function exact(value: string, category: string): CategoryRule {
  return { kind: 'exact', value, category };
}

function contains(value: string, category: string): CategoryRule {
  return { kind: 'contains', value, category };
}

/** Um título com a categoria que a regra `exact` correspondente já lhe deu. */
function titled(rules: CategoryRule[], extra: RuledTitle[] = []): RuledTitle[] {
  return [...rules.map((r) => ({ title: r.value, category: r.category })), ...extra];
}

const SHOPEE = [
  exact('Shopee *Inpower', 'Shopee'),
  exact('Shopee *Sieno', 'Shopee'),
  exact('Shopee *Agpratas', 'Shopee'),
  exact('Shopee *Volpi', 'Shopee'),
];

describe('suggestConsolidations', () => {
  it('propõe o trecho que cobre as regras de um mesmo lugar', () => {
    const [sugestao] = suggestConsolidations(SHOPEE, titled(SHOPEE));

    assert.equal(sugestao.category, 'Shopee');
    assert.ok(sugestao.value.startsWith('shopee'));
    assert.equal(sugestao.replaces.length, 4);
  });

  // O ganho que justifica a consolidação: o trecho não só substitui as regras
  // que existem, ele alcança o sufixo novo que ainda vai chegar.
  it('conta o que está em `outros` e passaria a ser capturado', () => {
    const titles = titled(SHOPEE, [{ title: 'Shopee *Novaloja', category: 'outros' }]);
    const [sugestao] = suggestConsolidations(SHOPEE, titles);

    assert.deepEqual(sugestao.captures, ['Shopee *Novaloja']);
  });

  // O risco de uma regra por trecho não está no que ela substitui, está no que
  // ela alcança sem querer.
  it('marca o conflito em vez de aplicar', () => {
    const titles = titled(SHOPEE, [{ title: 'Shopee *Farmacia', category: 'saúde' }]);
    const [sugestao] = suggestConsolidations(SHOPEE, titles);

    assert.equal(sugestao.replaces.length, 4);
    assert.deepEqual(sugestao.conflicts, [{ title: 'Shopee *Farmacia', category: 'saúde' }]);
  });

  // O caso real desta base: `shopee` cobre 52 regras e levaria 22 títulos que
  // estão em outras categorias, porque a Shopee é marketplace e a classificação
  // segue o que foi comprado. Silenciar isso esconderia a maior alavanca; e
  // sugerir mesmo assim destruiria classificação deliberada.
  it('devolve a segura e a bloqueada quando a bloqueada cobre mais', () => {
    const rules = [
      ...SHOPEE,
      exact('Shopee Express Alfa', 'Shopee'),
      exact('Shopee Express Beta', 'Shopee'),
      exact('Shopee Express Gama', 'Shopee'),
    ];
    const titles = titled(rules, [{ title: 'Shopee *Drogaria', category: 'saúde' }]);
    const sugestoes = suggestConsolidations(rules, titles);

    const bloqueada = sugestoes.find((s) => s.conflicts.length > 0);
    const segura = sugestoes.find((s) => s.conflicts.length === 0);

    assert.ok(bloqueada, 'a mais ampla precisa aparecer, mesmo bloqueada');
    assert.ok(segura, 'a alternativa segura precisa aparecer junto');
    assert.ok(bloqueada.replaces.length > segura.replaces.length);
    assert.equal(segura.value, 'shopee express ');
  });

  // `exact` continua ganhando de `contains` depois da troca: quem tem regra
  // própria não muda de dono, e portanto não impede a consolidação.
  it('não conta como conflito o título protegido pela própria regra exact', () => {
    const rules = [...SHOPEE, exact('Shopee *Farmacia', 'saúde')];
    const [sugestao] = suggestConsolidations(rules, titled(rules));

    assert.equal(sugestao.category, 'Shopee');
    assert.equal(sugestao.replaces.length, 4);
  });

  it('não sugere nada abaixo de três regras', () => {
    const duas = [exact('Shopee *Inpower', 'Shopee'), exact('Shopee *Sieno', 'Shopee')];
    assert.deepEqual(suggestConsolidations(duas, titled(duas)), []);
  });

  it('não sugere quando as regras não têm nada em comum', () => {
    const soltas = [
      exact('Jardelazevedo', 'Bebidas'),
      exact('Cervejariaduobus', 'Bebidas'),
      exact('Logbank*Cervejaria Duo', 'Bebidas'),
    ];
    assert.deepEqual(suggestConsolidations(soltas, titled(soltas)), []);
  });

  // Um trecho de três letras casaria com meio mundo; o piso existe para o
  // sugerido ser defensável, não só numeroso.
  it('não desce abaixo de quatro caracteres', () => {
    const curtas = [exact('Pag*Um', 'x'), exact('Pag*Dois', 'x'), exact('Pag*Tres', 'x')];
    for (const s of suggestConsolidations(curtas, titled(curtas))) {
      assert.ok(s.value.length >= 4, s.value);
    }
  });

  it('em empate de cobertura, fica com o trecho mais específico', () => {
    const [sugestao] = suggestConsolidations(SHOPEE, titled(SHOPEE));
    // `shopee`, `shopee ` e `shopee *` cobrem as mesmas quatro regras.
    assert.equal(sugestao.value, 'shopee *');
  });

  it('ordena pela economia total, da maior para a menor', () => {
    const rules = [
      ...SHOPEE,
      exact('Mp *Alfa', 'Mercado Livre'),
      exact('Mp *Beta', 'Mercado Livre'),
      exact('Mp *Gama', 'Mercado Livre'),
    ];
    const sugestoes = suggestConsolidations(rules, titled(rules));

    assert.deepEqual(
      sugestoes.map((s) => s.category),
      ['Shopee', 'Mercado Livre'],
    );
  });

  it('ignora as regras que já são por trecho', () => {
    const rules = [contains('shopee', 'Shopee'), ...SHOPEE.slice(0, 2)];
    assert.deepEqual(suggestConsolidations(rules, titled(rules)), []);
  });

  // O caso que motivou generalizar de prefixo para substring: o intermediário
  // que processa a cobrança muda de nome ao longo dos anos, e as regras que
  // nascem disso não compartilham prefixo nenhum — só a palavra do meio ou do
  // fim, que é o serviço de verdade.
  it('acha o trecho comum quando ele não é prefixo, só palavra do meio', () => {
    const rules = [
      exact('Ebanx*Spotify', 'Serviços'),
      exact('Dm *Spotify', 'Serviços'),
      exact('Ebw*Spotify', 'Serviços'),
    ];
    const [sugestao] = suggestConsolidations(rules, titled(rules));

    assert.equal(sugestao.category, 'Serviços');
    assert.ok(sugestao.value.includes('spotify'), sugestao.value);
    assert.equal(sugestao.replaces.length, 3);
  });

  // Sem o generalizar, "gateway" nunca apareceria como candidato — só
  // "ifood *ifd*" (prefixo). A palavra do fim precisa competir de igual para
  // igual com a do começo.
  it('prefere a palavra que cobre mais regras, esteja ela no início ou não', () => {
    const rules = [
      exact('Pag*Netflix', 'Streaming'),
      exact('Ebn*Netflix', 'Streaming'),
      exact('Dl*Netflix', 'Streaming'),
    ];
    const [sugestao] = suggestConsolidations(rules, titled(rules));

    assert.ok(sugestao.value.includes('netflix'), sugestao.value);
  });
});
