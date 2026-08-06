import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { compare, hash, hashSync } from 'bcryptjs';
import { Connection, Model, Types } from 'mongoose';
import { MailerService } from '../mail/mailer.service';
import { PasswordReset, PasswordResetDocument } from '../schemas/password-reset.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { destroySessions } from './session-store';

/**
 * Custo do bcrypt no cadastro — o mesmo do script `hash-password`, para que uma
 * conta criada pela tela e uma criada na mão sejam indistinguíveis.
 */
const BCRYPT_ROUNDS = 12;

/**
 * Hash de uma senha que não é de ninguém, comparado quando o usuário não existe.
 *
 * O `validate` antigo já tomava esse cuidado de outro jeito: ele rodava o
 * `compare` mesmo com o nome errado, porque parar cedo devolveria a resposta mais
 * rápido para um usuário inexistente — e essa diferença de tempo é o que um
 * ataque de enumeração mede. Com os usuários no banco, "não existe" passou a ser
 * um `findOne` que não acha nada, e sem esta isca o `compare` seria pulado de
 * volta.
 *
 * Gerado na carga, e não escrito à mão como constante: um hash literal
 * desatualizado — custo diferente, prefixo de outra versão do bcrypt — não
 * gastaria o mesmo tempo que os hashes reais, que é a única coisa que se quer
 * dele. Custa um bcrypt uma vez na subida do processo.
 */
const DUMMY_HASH = hashSync('nenhuma senha de ninguém', BCRYPT_ROUNDS);

/**
 * Quanto tempo o link de redefinição vale.
 *
 * Uma hora é o meio-termo honesto: curto o bastante para um e-mail antigo
 * esquecido numa caixa de entrada não virar uma chave permanente da conta, e
 * longo o bastante para quem pediu e só foi ler o e-mail depois do almoço.
 */
const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Intervalo mínimo entre dois pedidos de redefinição da mesma conta.
 *
 * Sem isto, um laço de requisições inunda a caixa de entrada de alguém e queima
 * a cota do Resend — e nada mais no projeto limita taxa. Um minuto não atrapalha
 * quem clicou de novo achando que o primeiro e-mail não chegou, porque o
 * primeiro token continua válido de qualquer forma.
 */
const RESET_COOLDOWN_MS = 60 * 1000;

/** O que o banco guarda de um token: o SHA-256 dele, nunca o token. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Contas do app: quem existe, quem é o dono da instância e quem pode entrar.
 *
 * O usuário deixou de morar no `.env` e passou a ser documento — mas o `.env`
 * ainda decide duas coisas que não são de usuário nenhum: o **código de convite**
 * que libera o cadastro, e **qual conta é a dona da instância**, isto é, a única
 * para quem a sincronização com o Google Drive existe.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly inviteCode: string;
  private readonly ownerUsername: string;
  private readonly appUrl: string;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(PasswordReset.name)
    private readonly resetModel: Model<PasswordResetDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly mailer: MailerService,
    config: ConfigService,
  ) {
    const inviteCode = config.get<string>('INVITE_CODE');
    if (!inviteCode) {
      throw new Error(
        'INVITE_CODE precisa estar no .env — é o código que libera o cadastro. ' +
          'Sem ele, a instância ficaria aberta a qualquer um que achasse a URL.',
      );
    }
    this.inviteCode = inviteCode;

    // O dono é quem já usava o app antes de ele ter contas, então o default é o
    // `AUTH_USERNAME` de sempre: quem não mexer no `.env` continua dono.
    this.ownerUsername = normalizeUsername(
      config.get<string>('OWNER_USERNAME') ?? config.get<string>('AUTH_USERNAME') ?? '',
    );

    // Base do link que vai no e-mail. Precisa ser o endereço que a pessoa abre
    // no navegador, e não o da API: em produção os dois diferem (o front está na
    // raiz, a API sob `/api`), e o default cobre `pnpm dev`.
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
  }

  /** Devolve o `_id` do usuário quando as credenciais batem, ou `null`. */
  async validate(username: string, password: string): Promise<string | null> {
    const user = await this.userModel.findOne({ username: normalizeUsername(username) }).exec();

    // Sempre compara alguma coisa — veja `DUMMY_HASH`.
    const matches = await compare(password, user?.passwordHash ?? DUMMY_HASH);
    return user && matches ? user._id.toString() : null;
  }

  /**
   * Cria a conta e devolve o `_id` dela.
   *
   * O código de convite vem antes de qualquer outra checagem: sem ele, a
   * resposta de "usuário já existe" viraria uma forma de descobrir quem tem
   * conta aqui, sem nem precisar de convite.
   */
  async register(
    username: string,
    email: string,
    password: string,
    inviteCode: string,
  ): Promise<string> {
    if (inviteCode !== this.inviteCode) {
      throw new ForbiddenException('Código de convite inválido.');
    }

    const clean = normalizeUsername(username);
    if (clean === '') throw new ConflictException('O usuário precisa de um nome.');

    const cleanEmail = normalizeUsername(email);
    const passwordHash = await hash(password, BCRYPT_ROUNDS);

    try {
      const user = await this.userModel.create({
        username: clean,
        email: cleanEmail,
        passwordHash,
      });
      return user._id.toString();
    } catch (error) {
      // Os índices únicos é que decidem de verdade: um `findOne` antes do
      // `create` deixaria a janela entre a leitura e a escrita, e dois cadastros
      // simultâneos com o mesmo nome passariam os dois.
      if (isDuplicateKey(error)) {
        // A mensagem diz qual dos dois colidiu porque os dois são escolhas do
        // usuário no mesmo formulário: "já existe" sem dizer o quê deixaria a
        // pessoa trocando o nome quando o problema era o e-mail.
        throw new ConflictException(
          duplicatedField(error) === 'email'
            ? `O e-mail "${cleanEmail}" já está em uso.`
            : `O usuário "${clean}" já existe.`,
        );
      }
      throw error;
    }
  }

  /**
   * Troca a senha de quem está logado, exigindo a senha atual.
   *
   * Pedir a senha de agora não é burocracia: sem isso, um notebook desbloqueado
   * por dois minutos basta para trocar a senha e expulsar o dono da própria
   * conta — a sessão sozinha seria autorização suficiente.
   *
   * Devolve quantas outras sessões caíram, que é o que a tela usa para avisar
   * "você foi desconectado dos outros aparelhos".
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    sessionAtual?: string,
  ): Promise<{ sessionsEncerradas: number }> {
    const user = await this.findById(userId);
    if (!user) throw new UnauthorizedException('Sessão inválida ou expirada.');

    if (!(await compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('A senha atual não confere.');
    }

    return this.applyNewPassword(user, newPassword, sessionAtual);
  }

  /**
   * Começa a redefinição por e-mail. **Nunca diz se a conta existe.**
   *
   * O silêncio é o ponto: uma resposta diferente para endereço conhecido e
   * desconhecido transformaria esta rota num oráculo de quem tem conta aqui, e
   * bastaria um laço sobre uma lista de e-mails para levantar isso. Quem chama
   * responde 204 em qualquer caso — inclusive quando não manda e-mail nenhum,
   * como no limite de taxa e nas contas antigas sem endereço.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.userModel.findOne({ email: normalizeUsername(email) }).exec();
    if (!user) return;

    const ultimo = await this.resetModel
      .findOne({ userId: user._id })
      .sort({ createdAt: -1 })
      .exec();

    if (ultimo && Date.now() - ultimo.createdAt.getTime() < RESET_COOLDOWN_MS) {
      this.logger.warn(`Pedido de redefinição ignorado por limite de taxa: ${user.username}`);
      return;
    }

    // 32 bytes de `randomBytes`, e não algo derivado do usuário ou do relógio:
    // este token é a chave da conta enquanto vale, e um valor adivinhável aqui
    // vale tanto quanto a senha.
    const token = randomBytes(32).toString('base64url');
    await this.resetModel.create({
      userId: user._id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });

    const link = `${this.appUrl}/redefinir?token=${token}`;
    await this.mailer.send({
      to: user.email as string,
      subject: 'Redefinir sua senha do expense/analyzer',
      text:
        `Alguém — provavelmente você — pediu para redefinir a senha da conta "${user.username}".\n\n` +
        `${link}\n\n` +
        'O link vale por uma hora e só pode ser usado uma vez.\n' +
        'Se não foi você, ignore este e-mail: nada muda enquanto o link não for aberto.\n',
    });
  }

  /**
   * Fecha a redefinição: token válido vira senha nova.
   *
   * Token inexistente, expirado e já usado dão **a mesma** recusa. Distinguir os
   * três só ajudaria quem está testando tokens a saber que chegou perto.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const pedido = await this.resetModel.findOne({ tokenHash: hashToken(token) }).exec();

    if (!pedido || pedido.usedAt || pedido.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException(
        'Esse link de redefinição não vale mais. Peça um novo em "Esqueci minha senha".',
      );
    }

    const user = await this.userModel.findById(pedido.userId).exec();
    if (!user) throw new BadRequestException('Essa conta não existe mais.');

    // O token é marcado antes de a senha mudar: se algo falhar no meio, o pior
    // caso é um link gasto sem efeito — e não um link que continua valendo
    // depois de já ter trocado a senha uma vez.
    pedido.usedAt = new Date();
    await pedido.save();

    // Todos os outros pedidos em aberto morrem junto. Sem isto, um e-mail de
    // ontem ainda abriria a conta depois de a senha já ter sido redefinida hoje.
    await this.resetModel
      .updateMany(
        { userId: user._id, usedAt: { $exists: false } },
        { $set: { usedAt: new Date() } },
      )
      .exec();

    // Sem poupar sessão nenhuma: quem redefine a senha não tem sessão aberta —
    // e se alguém tiver, é justamente quem se quer expulsar.
    await this.applyNewPassword(user, newPassword);
  }

  /** Grava o hash novo e derruba as sessões abertas. O caminho comum dos dois fluxos. */
  private async applyNewPassword(
    user: UserDocument,
    newPassword: string,
    sessionAtual?: string,
  ): Promise<{ sessionsEncerradas: number }> {
    user.passwordHash = await hash(newPassword, BCRYPT_ROUNDS);
    await user.save();

    const sessionsEncerradas = await destroySessions(
      this.connection,
      user._id.toString(),
      sessionAtual,
    );

    return { sessionsEncerradas };
  }

  /** O nome de quem está na sessão, ou `null` se a conta sumiu do banco. */
  async findById(id: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.userModel.findById(id).exec();
  }

  /**
   * Se esta conta é a dona da instância.
   *
   * É o que separa quem tem Google Drive configurado de quem só sobe CSV: as
   * credenciais do Drive são de uma conta Google só, e pedir isso a cada usuário
   * está fora do que esta versão se propõe.
   */
  isOwner(username: string): boolean {
    return this.ownerUsername !== '' && normalizeUsername(username) === this.ownerUsername;
  }
}

/** Minúsculas e sem espaço nas pontas — a forma em que o nome é gravado e comparado. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** O erro 11000 do Mongo, que é como o índice único recusa um nome repetido. */
function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

/** Qual campo o índice único recusou — o Mongo diz isso em `keyPattern`. */
function duplicatedField(error: unknown): string | undefined {
  const keyPattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern;
  return keyPattern ? Object.keys(keyPattern)[0] : undefined;
}
