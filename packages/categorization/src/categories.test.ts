import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aliasForCategory, isProtectedCategory, PROTECTED_CATEGORIES } from './categories';

describe('isProtectedCategory', () => {
  // A lista sai dos próprios aliases: um `refund_*` novo traduzido amanhã entra
  // aqui sozinho, sem ninguém lembrar de atualizar duas listas.
  it('cobre o pagamento e todo rótulo que um alias produz', () => {
    assert.ok(isProtectedCategory('payment'));
    for (const category of ['estorno', 'impostos', 'parcelado']) {
      assert.ok(isProtectedCategory(category), category);
      assert.ok(PROTECTED_CATEGORIES.includes(category));
    }
  });

  it('não protege categoria de gasto, que é justamente o que a regra reclassifica', () => {
    for (const category of ['supermercado', 'outros', 'mercado livre', 'saúde']) {
      assert.equal(isProtectedCategory(category), false, category);
    }
  });

  // O guard olha `sourceCategory`, não `category` — e `sourceCategory` guarda o
  // rótulo já traduzido, nunca o código cru. Se um dia guardasse o código, esta
  // asserção quebraria e diria por quê.
  it('protege o rótulo traduzido, que é o que fica gravado', () => {
    assert.equal(aliasForCategory('reversal_brazil_settled'), 'estorno');
    assert.ok(isProtectedCategory('estorno'));
  });
});
