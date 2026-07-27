import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';

/*
 * Páginas carregadas sob demanda.
 *
 * O peso do bundle é quase todo Recharts, e ele só existe em duas das três telas
 * — quem abre Faturas não deveria pagar por um motor de gráficos que aquela tela
 * não usa. Como o shell não é lazy, o header e a navegação aparecem na hora e só
 * o miolo espera.
 */
const Dashboard = lazy(() => import('../pages/Dashboard/Dashboard'));
const Home = lazy(() => import('../pages/Home/Home'));
const Bills = lazy(() => import('../pages/Bills/Bills'));

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

function lazyRoute(Page: React.LazyExoticComponent<() => React.JSX.Element>) {
  return (
    <Suspense fallback={<PageFallback />}>
      <Page />
    </Suspense>
  );
}

// O shell é uma rota de layout: header e container ficam num lugar só, e cada
// página cuida apenas do próprio conteúdo.
const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: lazyRoute(Dashboard) },
      { path: '/purchases', element: lazyRoute(Home) },
      { path: '/bills', element: lazyRoute(Bills) },
    ],
  },
]);

export default router;
