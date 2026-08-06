import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startTestDb, type TestDb } from '../testing/mongo';
import { AuthService } from './auth.service';

const CONVITE = 'convite-de-teste';

/** O suficiente do `ConfigService` para o construtor — só `get` é chamado. */
function configWith(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as never;
}

describe('AuthService', () => {
  let db: TestDb;
  let service: AuthService;

  before(async () => {
    db = await startTestDb();
    service = new AuthService(
      db.users,
      configWith({ INVITE_CODE: CONVITE, OWNER_USERNAME: 'ana' }),
    );
  });

  after(async () => db.stop());
  beforeEach(async () => db.clear());

  it('recusa configurar sem código de convite', () => {
    assert.throws(() => new AuthService(db.users, configWith({})), /INVITE_CODE/);
  });

  describe('register', () => {
    it('cria a conta e devolve o id dela', async () => {
      const id = await service.register('Ana', 'senha-secreta', CONVITE);

      const saved = await db.users.findById(id).exec();
      // Guardado em minúsculas: `Ana` e `ana` são a mesma pessoa.
      assert.equal(saved?.username, 'ana');
      // A senha em texto puro não vai para lugar nenhum.
      assert.notEqual(saved?.passwordHash, 'senha-secreta');
    });

    it('recusa convite errado', async () => {
      await assert.rejects(
        () => service.register('ana', 'senha-secreta', 'chute'),
        /convite inválido/,
      );
      assert.equal(await db.users.countDocuments(), 0);
    });

    it('recusa usuário repetido, mesmo com outra caixa', async () => {
      await service.register('ana', 'senha-secreta', CONVITE);

      await assert.rejects(() => service.register('ANA', 'outra-senha', CONVITE), /já existe/);
    });
  });

  describe('validate', () => {
    it('aceita usuário e senha corretos, ignorando a caixa do nome', async () => {
      const id = await service.register('ana', 'senha-secreta', CONVITE);

      assert.equal(await service.validate('Ana', 'senha-secreta'), id);
    });

    it('recusa senha errada', async () => {
      await service.register('ana', 'senha-secreta', CONVITE);

      assert.equal(await service.validate('ana', 'errada'), null);
    });

    it('recusa usuário que não existe', async () => {
      assert.equal(await service.validate('bia', 'senha-secreta'), null);
    });
  });

  describe('isOwner', () => {
    it('reconhece a conta de OWNER_USERNAME', () => {
      assert.equal(service.isOwner('ana'), true);
      assert.equal(service.isOwner('bia'), false);
    });

    it('não elege ninguém dono quando não há OWNER_USERNAME nem AUTH_USERNAME', () => {
      const semDono = new AuthService(db.users, configWith({ INVITE_CODE: CONVITE }));

      assert.equal(semDono.isOwner(''), false);
      assert.equal(semDono.isOwner('ana'), false);
    });
  });
});
