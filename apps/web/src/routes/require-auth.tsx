import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';

/**
 * Guarda de rota: sem sessão, manda para `/login` e guarda de onde veio, para o
 * login devolver ali — não sempre em `/dashboard`. Enquanto a checagem inicial
 * não voltou, não mostra nem o shell nem o login, para não piscar um antes do
 * outro.
 */
export function RequireAuth() {
  const { authenticated, checking } = useAuth();
  const location = useLocation();

  if (checking) return <div className="min-h-dvh bg-background" />;
  if (!authenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
