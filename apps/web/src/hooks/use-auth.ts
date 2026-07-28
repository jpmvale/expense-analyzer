import { useContext } from 'react';
import { AuthContext } from '@/lib/auth';

/** Sessão atual e como entrar/sair dela. Exige estar sob o <AuthProvider>. */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  }
  return context;
}
