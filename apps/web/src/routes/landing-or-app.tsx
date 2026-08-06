import { Navigate } from 'react-router-dom';
import Landing from '@/pages/Landing/Landing';
import { useAuth } from '@/hooks/use-auth';

/**
 * O que a raiz mostra: a aterrissagem para quem chega de fora, o app para quem
 * já entrou.
 *
 * Antes `/` era só um `<Navigate to="/dashboard">` dentro do `<RequireAuth>`, o
 * que na prática mandava todo visitante direto para o login — uma caixa de
 * usuário e senha sem uma palavra sobre o que o app é, e sem avisar que ele vai
 * pedir os CSVs das faturas.
 *
 * O `checking` não é detalhe: enquanto a sessão não foi verificada, mostrar a
 * landing faria a página piscar uma tela de apresentação na cara de quem só
 * queria abrir o próprio painel. A tela vazia é a mesma que o `RequireAuth` usa
 * nesse instante, e pelo mesmo motivo.
 */
export function LandingOrApp() {
  const { authenticated, checking } = useAuth();

  if (checking) return <div className="min-h-dvh bg-background" />;
  if (authenticated) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}
