import { AlertCircleIcon, ArchiveIcon, RepeatIcon, TrendingUpIcon, WalletIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { RecurringList } from '@/components/recurring-list';
import { StatCard } from '@/components/stat-card';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { RecurringCharge } from '@/interface/recurring';
import { currency } from '@/lib/utils';
import { listRecurring } from '../../api/client';

function Recurring() {
  const [charges, setCharges] = useState<RecurringCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRecurring()
      .then(setCharges)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  const { active, ended, monthly, yearlyIncrease } = useMemo(() => {
    const active = charges.filter((charge) => charge.active);

    return {
      active,
      ended: charges.filter((charge) => !charge.active),
      monthly: active.reduce((acc, charge) => acc + charge.current, 0),
      /*
       * Quanto os reajustes já aplicados custam por ano.
       *
       * É a única forma de o número doer o suficiente para virar decisão: uma
       * assinatura que subiu R$ 12 por mês parece troco, e são R$ 144 no ano.
       * Só entram as ativas — reajuste de coisa cancelada não custa nada — e só
       * as altas, porque somar as quedas junto daria um saldo que não responde
       * pergunta nenhuma.
       */
      yearlyIncrease: active.reduce(
        (acc, charge) =>
          charge.previous !== null && charge.current > charge.previous
            ? acc + (charge.current - charge.previous) * 12
            : acc,
        0,
      ),
    };
  }, [charges]);

  return (
    <>
      <PageHeader
        title="Assinaturas"
        description="Cobranças que se repetem todo mês com preço estável, e o degrau quando esse preço muda. É a pergunta que o extrato do banco não responde: o que subiu sem você perceber."
      />

      {error && (
        <Card className="mb-4 flex items-start gap-3 border-destructive/40 p-4 text-sm">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Não deu para carregar as assinaturas.</p>
            <p className="mt-0.5 text-muted-foreground">{error}</p>
          </div>
        </Card>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Por mês, hoje"
          value={currency(monthly)}
          hint="soma do preço atual das ativas"
          Icon={WalletIcon}
          loading={loading}
        />
        <StatCard
          label="Ativas"
          value={active.length.toLocaleString('pt-BR')}
          hint={`${ended.length} já encerradas`}
          Icon={RepeatIcon}
          loading={loading}
        />
        <StatCard
          label="Os reajustes custam"
          value={`${yearlyIncrease > 0 ? '+' : ''}${currency(yearlyIncrease)}`}
          hint="por ano, sobre o preço anterior"
          Icon={TrendingUpIcon}
          loading={loading}
        />
      </div>

      {loading ? (
        <Card className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </Card>
      ) : charges.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma cobrança recorrente detectada. São necessários ao menos seis meses de cobrança com
          preço estável para uma série virar assinatura.
        </Card>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
                <RepeatIcon className="size-4 text-muted-foreground" />
                Ativas
              </h2>
              <RecurringList charges={active} />
            </section>
          )}

          {ended.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
                <ArchiveIcon className="size-4 text-muted-foreground" />
                Encerradas
              </h2>
              {/* Ficam na tela porque é onde se confere se um cancelamento
                  pegou — e porque o histórico de preço de algo que você já teve
                  é o que dá noção de quanto o mercado subiu. */}
              <RecurringList charges={ended} />
            </section>
          )}
        </div>
      )}
    </>
  );
}

export default Recurring;
