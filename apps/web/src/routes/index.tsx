import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { Bills } from '../pages/Bills';
import { Dashboard } from '../pages/Dashboard';
import { Home } from '../pages/Home';

// O shell é uma rota de layout: header e container ficam num lugar só, e cada
// página cuida apenas do próprio conteúdo. Antes toda página envolvia a si mesma
// no <AppBar>, repetindo o cabeçalho três vezes.
const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/purchases', element: <Home /> },
      { path: '/bills', element: <Bills /> },
      { path: '/dashboard', element: <Dashboard /> },
    ],
  },
]);

export default router;
