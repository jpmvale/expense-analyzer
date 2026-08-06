import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { compare, hash, hashSync } from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

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
 * Contas do app: quem existe, quem é o dono da instância e quem pode entrar.
 *
 * O usuário deixou de morar no `.env` e passou a ser documento — mas o `.env`
 * ainda decide duas coisas que não são de usuário nenhum: o **código de convite**
 * que libera o cadastro, e **qual conta é a dona da instância**, isto é, a única
 * para quem a sincronização com o Google Drive existe.
 */
@Injectable()
export class AuthService {
  private readonly inviteCode: string;
  private readonly ownerUsername: string;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
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
  async register(username: string, password: string, inviteCode: string): Promise<string> {
    if (inviteCode !== this.inviteCode) {
      throw new ForbiddenException('Código de convite inválido.');
    }

    const clean = normalizeUsername(username);
    if (clean === '') throw new ConflictException('O usuário precisa de um nome.');

    const passwordHash = await hash(password, BCRYPT_ROUNDS);

    try {
      const user = await this.userModel.create({ username: clean, passwordHash });
      return user._id.toString();
    } catch (error) {
      // O índice único é o que decide de verdade: um `findOne` antes do `create`
      // deixaria a janela entre a leitura e a escrita, e dois cadastros
      // simultâneos com o mesmo nome passariam os dois.
      if (isDuplicateKey(error)) {
        throw new ConflictException(`O usuário "${clean}" já existe.`);
      }
      throw error;
    }
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
