import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { excludeTrashed } from './drive';

describe('excludeTrashed', () => {
  // Regressão: o files.list do Drive devolve arquivos da lixeira por padrão, então
  // apagar uma fatura duplicada no Drive não surtia efeito — ela voltava na
  // extração seguinte, sobrescrevendo o mês.
  it('restringe a busca aos arquivos vivos', () => {
    assert.equal(excludeTrashed("name contains 'nubank'"), "(name contains 'nubank') and trashed = false");
  });

  // Sem os parênteses, `a or b and trashed = false` seria lido como
  // `a or (b and trashed = false)` — e os arquivos de `a` viriam com lixeira.
  it('protege filtros com `or` com parênteses', () => {
    assert.equal(
      excludeTrashed("name contains 'nubank' or name contains 'fatura'"),
      "(name contains 'nubank' or name contains 'fatura') and trashed = false",
    );
  });
});
