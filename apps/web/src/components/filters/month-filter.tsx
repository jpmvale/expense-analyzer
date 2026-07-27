import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatMonth } from '@/lib/utils';

/** O Radix não aceita valor vazio num item, então "todas" precisa de sentinela. */
const ALL = '__all__';

interface MonthFilterProps {
  /** Meses de fatura existentes, em `YYYY-MM`, do mais antigo ao mais recente. */
  months: string[];
  value: string | null;
  onChange: (month: string | null) => void;
}

/**
 * Lista as faturas que existem de verdade, em vez de um calendário genérico:
 * a app sabe exatamente quais meses tem, e oferecer um mês vazio só produz uma
 * tela sem resultado. Do mais recente para o mais antigo, agrupado por ano.
 */
export function MonthFilter({ months, value, onChange }: MonthFilterProps) {
  const byYear = new Map<string, string[]>();
  for (const month of [...months].reverse()) {
    const year = month.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), month]);
  }

  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? null : next)}
    >
      <SelectTrigger aria-label="Filtrar por fatura">
        <SelectValue placeholder="Todas as faturas" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todas as faturas</SelectItem>
        {[...byYear].map(([year, yearMonths]) => (
          <SelectGroup key={year}>
            <SelectLabel>{year}</SelectLabel>
            {yearMonths.map((month) => (
              <SelectItem key={month} value={month}>
                {formatMonth(month)}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
