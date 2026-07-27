import { ConstructionIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';

/** Vira a visão geral da app na etapa 6 da migração. */
const Dashboard = () => {
  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Um retrato do mês corrente e da evolução dos seus gastos."
      />
      <Card>
        <CardContent className="flex items-center gap-3 pt-4 text-sm text-muted-foreground sm:pt-5">
          <ConstructionIcon className="size-4 shrink-0" />
          Ainda não implementada. Por enquanto, os gráficos por mês e por categoria estão em
          Compras.
        </CardContent>
      </Card>
    </>
  );
};

export default Dashboard;
