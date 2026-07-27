import { ArrowDownRightIcon, ArrowUpRightIcon, CheckCircle2Icon } from 'lucide-react';
import type { CategoryExpectation } from '@/lib/categoryExpectation';
import { capitalize, cn, currency } from '@/lib/utils';

/**
 * O que fugiu do normal no mês, por categoria.
 *
 * A régua é o histórico da própria categoria, e não um percentual fixo: a
 * Academia varia 7% ao mês e `lazer` varia 94%, então os mesmos "+40%"
 * significam coisas opostas nas duas. O quanto cada uma fugiu é decidido em
 * `categoryExpectation`; aqui só se mostra, e em reais — o desvio estatístico
 * que filtrou a lista não aparece porque não é legível.
 */
export function ExpectationList({
  expectations,
  month,
}: {
  expectations: CategoryExpectation[];
  month: string;
}) {
  if (expectations.length === 0) {
    return (
      <div className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-positive" />
        {/* Mês silencioso é resposta, não ausência de resposta: significa que
            nenhuma categoria saiu do padrão dos doze meses anteriores. */}
        <p>
          Nada fugiu do normal em {month}. Cada categoria ficou dentro da própria variação dos 12
          meses anteriores.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {expectations.map((item) => {
        const up = item.difference > 0;
        const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon;

        return (
          <li key={item.category} className="flex items-center gap-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{capitalize(item.category)}</span>
              <span className="tabular mt-0.5 block text-xs text-muted-foreground">
                {currency(item.current)} · normal {currency(item.baseline)}
              </span>
            </span>

            <span
              className={cn(
                'shrink-0 text-right',
                up ? 'text-destructive' : 'text-positive',
              )}
            >
              <span className="tabular flex items-center justify-end gap-1 font-medium">
                <Icon className="size-3.5 shrink-0" />
                {up ? '+' : '−'}
                {currency(Math.abs(item.difference))}
              </span>
              {/* Sem base não há percentual: a categoria passou metade dos meses
                  em zero, e dividir por zero inventaria um número. */}
              {item.change !== null && (
                <span className="tabular mt-0.5 block text-xs text-muted-foreground">
                  {item.change > 0 ? '+' : ''}
                  {item.change.toFixed(0)}%
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
