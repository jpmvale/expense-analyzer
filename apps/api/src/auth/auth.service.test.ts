import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashSync } from 'bcryptjs';
import { AuthService } from './auth.service';

/** O suficiente do `ConfigService` para o construtor — só `get` é chamado. */
function configWith(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as never;
}

describe('AuthService', () => {
  it('recusa configurar sem usuário ou hash', () => {
    assert.throws(() => new AuthService(configWith({})), /AUTH_USERNAME e AUTH_PASSWORD_HASH/);
    assert.throws(
      () => new AuthService(configWith({ AUTH_USERNAME: 'ana' })),
      /AUTH_USERNAME e AUTH_PASSWORD_HASH/,
    );
  });

  it('aceita usuário e senha corretos', async () => {
    const service = new AuthService(
      configWith({ AUTH_USERNAME: 'ana', AUTH_PASSWORD_HASH: hashSync('segredo', 4) }),
    );

    assert.equal(await service.validate('ana', 'segredo'), 'ana');
  });

  it('recusa senha errada', async () => {
    const service = new AuthService(
      configWith({ AUTH_USERNAME: 'ana', AUTH_PASSWORD_HASH: hashSync('segredo', 4) }),
    );

    assert.equal(await service.validate('ana', 'errada'), null);
  });

  it('recusa usuário errado, mesmo com a senha certa', async () => {
    const service = new AuthService(
      configWith({ AUTH_USERNAME: 'ana', AUTH_PASSWORD_HASH: hashSync('segredo', 4) }),
    );

    assert.equal(await service.validate('bia', 'segredo'), null);
  });
});
