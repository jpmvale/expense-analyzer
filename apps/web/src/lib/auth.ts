/**
 * A sessão do usuário logado.
 *
 * A API guarda a sessão num cookie httpOnly — o front nunca vê um token, só
 * pergunta `GET /auth/session` e recebe quem é. `checking` existe para não
 * piscar a tela de login no primeiro instante, antes da resposta chegar.
 */
import { createContext } from 'react';

export interface AuthContextValue {
  authenticated: boolean;
  checking: boolean;
  /** O nome de quem está logado, ou `null` fora de uma sessão. */
  username: string | null;
  /** O e-mail da conta. `null` nas contas anteriores ao campo. */
  email: string | null;
  /**
   * Se esta conta é a dona da instância — a única com Google Drive configurado.
   * As demais sobem as faturas pela tela de Importar.
   */
  isOwner: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (
    username: string,
    email: string,
    password: string,
    inviteCode: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

/** Mora aqui, e não junto do provider, para o fast-refresh não perder o módulo. */
export const AuthContext = createContext<AuthContextValue | null>(null);
