import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { compare } from 'bcryptjs';
import type { MailerService } from '../mail/mailer.service';
import { startTestDb, type TestDb } from '../testing/mongo';
import { AuthService } from './auth.service';

const CONVITE = 'convite-de-teste';

/** O suficiente do `ConfigService` para o construtor — só `get` é chamado. */
function configWith(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as never;
}

/**
 * Um mailer que guarda o que teria mandado.
 *
 * O de verdade também não manda nada sem credencial — ele registra no log —, mas
 * um duplo aqui é o que deixa o teste **ler o link**, que é a única forma de
 * chegar ao token: o banco só tem o hash dele.
 */
function mailerFalso() {
  const enviados: { to: string; subject: string; text: string }[] = [];
  const service = {
    send: (email: { to: string; subject: string; text: string }) => {
      enviados.push(email);
      return Promise.resolve();
    },
  } as MailerService;
  return { service, enviados };
}

/** O token de dentro do link, que é o que a redefinição recebe. */
function tokenDoEmail(texto: string): string {
  const match = texto.match(/redefinir\?token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error('o e-mail não trouxe link de redefinição');
  return match[1];
}

describe('AuthService', () => {
  let db: TestDb;
  let service: AuthService;
  let mailer: ReturnType<typeof mailerFalso>;

  before(async () => {
    db = await startTestDb();
  });

  after(async () => db.stop());

  beforeEach(async () => {
    await db.clear();
    mailer = mailerFalso();
    service = new AuthService(
      db.users,
      db.resets,
      db.connection,
      mailer.service,
      configWith({ INVITE_CODE: CONVITE, OWNER_USERNAME: 'ana', APP_URL: 'https://app.exemplo' }),
    );
  });

  it('recusa configurar sem código de convite', () => {
    assert.throws(
      () =>
        new AuthService(db.users, db.resets, db.connection, mailer.service, configWith({})),
      /INVITE_CODE/,
    );
  });

  describe('register', () => {
    it('cria a conta com e-mail e devolve o id dela', async () => {
      const id = await service.register('Ana', 'Ana@Exemplo.com', 'senha-secreta', CONVITE);

      const saved = await db.users.findById(id).exec();
      // Nome e e-mail em minúsculas: é assim que o login e o "esqueci" procuram.
      assert.equal(saved?.username, 'ana');
      assert.equal(saved?.email, 'ana@exemplo.com');
      assert.notEqual(saved?.passwordHash, 'senha-secreta');
    });

    it('recusa convite errado', async () => {
      await assert.rejects(
        () => service.register('ana', 'ana@exemplo.com', 'senha-secreta', 'chute'),
        /convite inválido/,
      );
      assert.equal(await db.users.countDocuments(), 0);
    });

    it('recusa usuário repetido, mesmo com outra caixa', async () => {
      await service.register('ana', 'ana@exemplo.com', 'senha-secreta', CONVITE);

      await assert.rejects(
        () => service.register('ANA', 'outra@exemplo.com', 'outra-senha', CONVITE),
        /usuário "ana" já existe/,
      );
    });

    // A mensagem precisa dizer QUAL dos dois colidiu: os dois vêm do mesmo
    // formulário, e "já existe" sozinho faria a pessoa trocar o nome quando o
    // problema era o e-mail.
    it('recusa e-mail repetido, dizendo que foi o e-mail', async () => {
      await service.register('ana', 'compartilhado@exemplo.com', 'senha-secreta', CONVITE);

      await assert.rejects(
        () => service.register('bia', 'compartilhado@exemplo.com', 'outra-senha', CONVITE),
        /e-mail "compartilhado@exemplo.com" já está em uso/,
      );
    });
  });

  describe('changePassword', () => {
    it('troca a senha quando a atual confere', async () => {
      const id = await service.register('ana', 'ana@exemplo.com', 'senha-antiga', CONVITE);

      await service.changePassword(id, 'senha-antiga', 'senha-nova-boa');

      assert.equal(await service.validate('ana', 'senha-antiga'), null);
      assert.equal(await service.validate('ana', 'senha-nova-boa'), id);
    });

    it('recusa com a senha atual errada, e não muda nada', async () => {
      const id = await service.register('ana', 'ana@exemplo.com', 'senha-antiga', CONVITE);

      await assert.rejects(
        () => service.changePassword(id, 'chute', 'senha-nova-boa'),
        /senha atual não confere/,
      );
      assert.equal(await service.validate('ana', 'senha-antiga'), id);
    });

    /**
     * A metade que faz a troca de senha valer alguma coisa: quem já estava
     * dentro com a senha antiga precisa cair. A sessão de quem troca é poupada
     * pelo id passado — senão a pessoa se expulsaria ao mudar a própria senha.
     */
    it('derruba as outras sessões da conta e poupa a de quem trocou', async () => {
      const id = await service.register('ana', 'ana@exemplo.com', 'senha-antiga', CONVITE);
      const sessions = db.connection.db!.collection('sessions');
      await sessions.insertMany([
        { _id: 'atual' as never, session: JSON.stringify({ userId: id }) },
        { _id: 'outra' as never, session: JSON.stringify({ userId: id }) },
        // De outra conta: não pode cair junto.
        { _id: 'vizinha' as never, session: JSON.stringify({ userId: 'outro-usuario' }) },
      ]);

      const { sessionsEncerradas } = await service.changePassword(
        id,
        'senha-antiga',
        'senha-nova-boa',
        'atual',
      );

      assert.equal(sessionsEncerradas, 1);
      assert.deepEqual(
        (await sessions.find().toArray()).map((s) => s._id).sort(),
        ['atual', 'vizinha'],
      );
    });
  });

  describe('forgotPassword', () => {
    it('manda o link para a conta do e-mail', async () => {
      await service.register('ana', 'ana@exemplo.com', 'senha-antiga', CONVITE);

      await service.forgotPassword('Ana@Exemplo.com');

      assert.equal(mailer.enviados.length, 1);
      assert.equal(mailer.enviados[0].to, 'ana@exemplo.com');
      assert.match(mailer.enviados[0].text, /https:\/\/app\.exemplo\/redefinir\?token=/);
    });

    // O silêncio é a defesa: uma resposta ou um efeito diferente para e-mail
    // conhecido e desconhecido diria a qualquer um quem tem conta aqui.
    it('não faz nada, e não reclama, para e-mail sem conta', async () => {
      await service.forgotPassword('ninguem@exemplo.com');

      assert.equal(mailer.enviados.length, 0);
      assert.equal(await db.resets.countDocuments(), 0);
    });

    it('guarda o hash do token, nunca o token', async () => {
      await service.register('ana', 'ana@exemplo.com', 'senha-antiga', CONVITE);
      await service.forgotPassword('ana@exemplo.com');

      const token = tokenDoEmail(mailer.enviados[0].text);
      const pedido = await db.resets.findOne().exec();

      assert.ok(pedido);
      assert.notEqual(pedido.tokenHash, token);
      assert.equal(await db.resets.countDocuments({ tokenHash: token }), 0);
    });

    it('recusa o segundo pedido em menos de um minuto', async () => {
      await service.register('ana', 'ana@exemplo.com', 'senha-antiga', CONVITE);

      await service.forgotPassword('ana@exemplo.com');
      await service.forgotPassword('ana@exemplo.com');

      assert.equal(mailer.enviados.length, 1);
      assert.equal(await db.resets.countDocuments(), 1);
    });
  });

  describe('resetPassword', () => {
    /** Cadastra, pede a redefinição e devolve o id e o token do e-mail. */
    async function comToken() {
      const id = await service.register('ana', 'ana@exemplo.com', 'senha-antiga', CONVITE);
      await service.forgotPassword('ana@exemplo.com');
      return { id, token: tokenDoEmail(mailer.enviados[0].text) };
    }

    it('troca a senha com o token do e-mail', async () => {
      const { id, token } = await comToken();

      await service.resetPassword(token, 'senha-nova-boa');

      assert.equal(await service.validate('ana', 'senha-antiga'), null);
      assert.equal(await service.validate('ana', 'senha-nova-boa'), id);
    });

    it('recusa o mesmo token duas vezes', async () => {
      const { token } = await comToken();
      await service.resetPassword(token, 'senha-nova-boa');

      await assert.rejects(() => service.resetPassword(token, 'outra-senha-boa'), /não vale mais/);
      // E a senha da primeira troca continua valendo.
      assert.ok(await service.validate('ana', 'senha-nova-boa'));
    });

    it('recusa token expirado', async () => {
      const { token } = await comToken();
      await db.resets.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });

      await assert.rejects(() => service.resetPassword(token, 'senha-nova-boa'), /não vale mais/);
    });

    it('recusa token que não existe, com a mesma mensagem', async () => {
      await assert.rejects(
        () => service.resetPassword('token-inventado', 'senha-nova-boa'),
        /não vale mais/,
      );
    });

    /**
     * Dois pedidos, e o segundo redefine: o primeiro link precisa morrer junto.
     * Sem isso um e-mail de ontem continuaria abrindo a conta depois de a senha
     * já ter sido trocada hoje.
     */
    it('invalida os outros pedidos em aberto da mesma conta', async () => {
      const { token: primeiro } = await comToken();

      // Envelhece o pedido para contornar o limite de um por minuto, que não é o
      // assunto deste teste. Pelo **driver cru**, e não pelo `Model`: com
      // `timestamps` no schema, o Mongoose descarta `createdAt` de um `$set` em
      // silêncio — o update responde "ok", o campo não muda, e o teste falha
      // três linhas depois por um motivo que não tem nada a ver.
      await db.resets.collection.updateMany(
        {},
        { $set: { createdAt: new Date(Date.now() - 120_000) } },
      );
      await service.forgotPassword('ana@exemplo.com');
      const segundo = tokenDoEmail(mailer.enviados[1].text);

      await service.resetPassword(segundo, 'senha-nova-boa');

      await assert.rejects(() => service.resetPassword(primeiro, 'terceira-senha'), /não vale mais/);
    });

    it('grava o hash da senha nova, e não a senha', async () => {
      const { id, token } = await comToken();

      await service.resetPassword(token, 'senha-nova-boa');

      const user = await db.users.findById(id).exec();
      assert.notEqual(user?.passwordHash, 'senha-nova-boa');
      assert.ok(await compare('senha-nova-boa', user!.passwordHash));
    });
  });

  describe('isOwner', () => {
    it('reconhece a conta de OWNER_USERNAME', () => {
      assert.equal(service.isOwner('ana'), true);
      assert.equal(service.isOwner('bia'), false);
    });

    it('não elege ninguém dono quando não há OWNER_USERNAME nem AUTH_USERNAME', () => {
      const semDono = new AuthService(
        db.users,
        db.resets,
        db.connection,
        mailer.service,
        configWith({ INVITE_CODE: CONVITE }),
      );

      assert.equal(semDono.isOwner(''), false);
      assert.equal(semDono.isOwner('ana'), false);
    });
  });
});
