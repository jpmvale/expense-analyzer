import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isFutureDate } from './utils';

describe('isFutureDate', () => {
  it('reconhece uma data depois de agora', () => {
    assert.equal(isFutureDate(new Date(Date.now() + 86_400_000).toISOString()), true);
  });

  it('não marca uma data passada', () => {
    assert.equal(isFutureDate(new Date(Date.now() - 86_400_000).toISOString()), false);
  });

  it('não marca o instante exato de agora', () => {
    assert.equal(isFutureDate(new Date().toISOString()), false);
  });
});
