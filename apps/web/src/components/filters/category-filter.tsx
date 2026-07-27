import { ChevronDownIcon, TagIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { capitalize, cn } from '@/lib/utils';

interface CategoryFilterProps {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}

export function CategoryFilter({ options, value, onChange }: CategoryFilterProps) {
  const toggle = (category: string) => {
    onChange(
      value.includes(category) ? value.filter((c) => c !== category) : [...value, category],
    );
  };

  const label =
    value.length === 0
      ? 'Todas as categorias'
      : value.length === 1
        ? capitalize(value[0])
        : `${value.length} categorias`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-9 w-full justify-between gap-2 font-normal',
            value.length === 0 && 'text-muted-foreground',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <TagIcon className="size-4 shrink-0 opacity-60" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="max-h-80 w-64 overflow-y-auto">
        {options.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nenhuma categoria.</p>
        ) : (
          <>
            {options.map((category) => (
              <label
                key={category}
                className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={value.includes(category)}
                  onCheckedChange={() => toggle(category)}
                />
                <span className="truncate">{capitalize(category)}</span>
              </label>
            ))}
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mt-1 w-full rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Limpar seleção
              </button>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
