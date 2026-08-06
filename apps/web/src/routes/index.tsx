import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import ForgotPasswordPage from '@/pages/ForgotPassword/ForgotPassword';
import LoginPage from '@/pages/Login/Login';
import ResetPasswordPage from '@/pages/ResetPassword/ResetPassword';
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
// — veja `pages/lazy`. `/login` fica fora do `<RequireAuth>` — é a única rota
// que precisa funcionar sem sessão.
const router = createBrowserRouter([
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
          { path: '/', element: <Navigate to="/dashboard" replace /> },
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
