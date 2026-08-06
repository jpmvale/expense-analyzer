import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import ForgotPasswordPage from '@/pages/ForgotPassword/ForgotPassword';
import LoginPage from '@/pages/Login/Login';
import ResetPasswordPage from '@/pages/ResetPassword/ResetPassword';
import { LandingOrApp } from './landing-or-app';
import {
  AccountPage,
  BillsPage,
  DashboardPage,
  ImportPage,
  PurchasesPage,
  RecurringPage,
  RulesPage,
  UncategorizedPage,
} from '../pages/lazy';
import { RequireAuth } from './require-auth';

// O shell é uma rota de layout: header e container ficam num lugar só, e cada
// página cuida apenas do próprio conteúdo. As páginas são carregadas sob demanda
// — veja `pages/lazy`. As rotas de fora do `<RequireAuth>` são as que precisam
// funcionar sem sessão: a raiz, o login e as duas de senha.
const router = createBrowserRouter([
  // A raiz decide pelo visitante: apresentação para quem chega de fora, painel
  // para quem já entrou. Não é `lazy` — é a primeira tela de quem clica no link,
  // e um spinner de carregamento de bundle bem aí seria o pior primeiro contato.
  { path: '/', element: <LandingOrApp /> },
  { path: '/login', element: <LoginPage /> },
  // As duas de senha ficam fora do `<RequireAuth>` pelo mesmo motivo do login:
  // quem esqueceu a senha não tem sessão para provar nada. Não são `lazy` —
  // são telas pequenas, e quem chega nelas vem de um link de e-mail, onde um
  // segundo carregando o pedaço do bundle é o pior momento possível.
  { path: '/esqueci', element: <ForgotPasswordPage /> },
  { path: '/redefinir', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/purchases', element: <PurchasesPage /> },
          { path: '/bills', element: <BillsPage /> },
          { path: '/recurring', element: <RecurringPage /> },
          { path: '/uncategorized', element: <UncategorizedPage /> },
          { path: '/rules', element: <RulesPage /> },
          { path: '/import', element: <ImportPage /> },
          { path: '/conta', element: <AccountPage /> },
        ],
      },
    ],
  },
]);

export default router;
