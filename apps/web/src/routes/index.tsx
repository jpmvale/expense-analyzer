import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { BillsPage, DashboardPage, PurchasesPage, UncategorizedPage } from '../pages/lazy';

// O shell é uma rota de layout: header e container ficam num lugar só, e cada
// página cuida apenas do próprio conteúdo. As páginas são carregadas sob demanda
// — veja `pages/lazy`.
const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/purchases', element: <PurchasesPage /> },
      { path: '/bills', element: <BillsPage /> },
      { path: '/uncategorized', element: <UncategorizedPage /> },
    ],
  },
]);

export default router;
