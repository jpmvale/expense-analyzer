import { lazy, Suspense, type ComponentType } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

/*
 * Páginas carregadas sob demanda.
 *
 * O peso do bundle é quase todo Recharts, e ele só existe em duas das três telas
 * — quem abre Faturas não deveria pagar por um motor de gráficos que aquela tela
 * não usa. Como o shell não é lazy, o header e a navegação aparecem na hora e só
 * o miolo espera.
 *
 * Moram aqui, e não no arquivo de rotas, porque aquele exporta a configuração do
 * router e não componentes — misturar as duas coisas quebra o fast-refresh.
 */

/** Aproxima a forma da página para a troca não dar solavanco no layout. */
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

function withSuspense(Page: ComponentType) {
  return function SuspendedPage() {
    return (
      <Suspense fallback={<PageFallback />}>
        <Page />
      </Suspense>
    );
  };
}

export const DashboardPage = withSuspense(lazy(() => import('./Dashboard/Dashboard')));
export const PurchasesPage = withSuspense(lazy(() => import('./Home/Home')));
export const BillsPage = withSuspense(lazy(() => import('./Bills/Bills')));
export const RecurringPage = withSuspense(lazy(() => import('./Recurring/Recurring')));
export const UncategorizedPage = withSuspense(lazy(() => import('./Uncategorized/Uncategorized')));
export const RulesPage = withSuspense(lazy(() => import('./Rules/Rules')));
export const ImportPage = withSuspense(lazy(() => import('./Import/Import')));
export const AccountPage = withSuspense(lazy(() => import('./Account/Account')));
