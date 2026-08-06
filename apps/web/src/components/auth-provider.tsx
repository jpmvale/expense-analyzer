import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSession, login, logout, register } from '@/api/client';
import type { Session } from '@/interface/session';
import { AuthContext, type AuthContextValue } from '@/lib/auth';

const ANONIMO: Session = { authenticated: false, username: null, isOwner: false };

/**
 * Verifica a sessão uma vez, na montagem — o cookie httpOnly não dá pra ler do
 * JS, então perguntar à API é a única forma de saber se já tem sessão aberta.
 * Enquanto isso, `checking` segura a tela de login: sem ele, quem já está
 * logado veria um flash da tela de login antes do redirecionamento de volta.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(ANONIMO);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getSession()
      .then(setSession)
      .catch(() => setSession(ANONIMO))
      .finally(() => setChecking(false));
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    setSession(await login(username, password));
  }, []);

  // Cadastrar já entra: a API abre a sessão na resposta do `POST /auth/register`,
  // então não há um segundo passo de login para o usuário.
  const signUp = useCallback(async (username: string, password: string, inviteCode: string) => {
    setSession(await register(username, password, inviteCode));
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setSession(ANONIMO);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      authenticated: session.authenticated,
      username: session.username,
      isOwner: session.isOwner,
      checking,
      signIn,
      signUp,
      signOut,
    }),
    [session, checking, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
