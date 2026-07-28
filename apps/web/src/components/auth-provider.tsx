import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSession, login, logout } from '@/api/client';
import { AuthContext, type AuthContextValue } from '@/lib/auth';

/**
 * Verifica a sessão uma vez, na montagem — o cookie httpOnly não dá pra ler do
 * JS, então perguntar à API é a única forma de saber se já tem sessão aberta.
 * Enquanto isso, `checking` segura a tela de login: sem ele, quem já está
 * logado veria um flash da tela de login antes do redirecionamento de volta.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getSession()
      .then(({ authenticated }) => setAuthenticated(authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false));
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    await login(username, password);
    setAuthenticated(true);
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setAuthenticated(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ authenticated, checking, signIn, signOut }),
    [authenticated, checking, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
