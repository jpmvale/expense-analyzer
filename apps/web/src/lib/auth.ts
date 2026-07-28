/**
 * Sessão do único usuário do app.
 *
 * A API guarda a sessão num cookie httpOnly — o front nunca vê um token, só
 * pergunta `GET /auth/session` e recebe sim/não. `checking` existe para não
 * piscar a tela de login no primeiro instante, antes da resposta chegar.
 */
import { createContext } from 'react';

export interface AuthContextValue {
  authenticated: boolean;
  checking: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

/** Mora aqui, e não junto do provider, para o fast-refresh não perder o módulo. */
export const AuthContext = createContext<AuthContextValue | null>(null);
