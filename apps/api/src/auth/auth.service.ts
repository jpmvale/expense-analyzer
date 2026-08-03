import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare } from 'bcryptjs';

/**
 * Um usuário só, guardado no `.env` — não há tela de cadastro nem coleção de
 * usuários. `AUTH_PASSWORD_HASH` é gerado por `pnpm --filter @expense/api
 * hash-password '<senha>'`; a senha em texto puro nunca é gravada em lugar
 * nenhum, nem no `.env`.
 */
@Injectable()
export class AuthService {
  private readonly username: string;
  private readonly passwordHash: string;

  constructor(config: ConfigService) {
    const username = config.get<string>('AUTH_USERNAME');
    const passwordHash = config.get<string>('AUTH_PASSWORD_HASH');
    if (!username || !passwordHash) {
      throw new Error(
        'AUTH_USERNAME e AUTH_PASSWORD_HASH precisam estar no .env. Gere o hash com ' +
          "`pnpm --filter @expense/api hash-password '<senha>'`.",
      );
    }
    this.username = username;
    this.passwordHash = passwordHash;
  }

  /** Devolve o `userId` de sessão quando as credenciais batem, ou `null`. */
  async validate(username: string, password: string): Promise<string | null> {
    // As duas comparações sempre rodam, mesmo com o usuário já errado: parar
    // cedo devolveria a resposta mais rápido para um usuário inexistente, e essa
    // diferença de tempo é o que um ataque de enumeração mede.
    const userMatches = username === this.username;
    const passwordMatches = await compare(password, this.passwordHash);
    return userMatches && passwordMatches ? this.username : null;
  }
}
