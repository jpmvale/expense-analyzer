import { CheckIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Category } from '@/interface/category';
import { capitalize, cn } from '@/lib/utils';

/** Mesma normalização do servidor: caixa e acento não distinguem categorias. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

interface CategoryPickerProps {
  categories: Category[];
  /** A categoria atual, marcada na lista. */
  value?: string;
  onSelect: (category: string) => void | Promise<unknown>;
  children: ReactNode;
  align?: 'start' | 'end';
}

/**
 * Escolhe uma categoria — ou cria uma na hora.
 *
 * O campo de busca é o mesmo de criar. Separar os dois em "buscar" e "adicionar"
 * faria o usuário digitar o nome duas vezes para descobrir que a categoria não
 * existia; aqui ele digita uma vez, e a opção de criar aparece exatamente quando
 * nada casou. É a única forma de criar categoria na interface, e ela fica onde a
 * necessidade aparece: no meio de classificar uma compra.
 */
export function CategoryPicker({
  categories,
  value,
  onSelect,
  children,
  align = 'end',
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const matches = useMemo(() => {
    if (trimmed === '') return categories;
    const needle = normalize(trimmed);
    return categories.filter((category) => normalize(category.name).includes(needle));
  }, [categories, trimmed]);

  // "Criar" só aparece quando nada tem exatamente esse nome. Com um casamento
  // parcial na lista — "mercado" existindo e o usuário digitando "mercado l" —
  // as duas opções convivem, que é o que se quer.
  const canCreate =
    trimmed !== '' && !categories.some((c) => normalize(c.name) === normalize(trimmed));

  const choose = async (category: string) => {
    setBusy(true);
    try {
      await onSelect(category);
      setOpen(false);
      setQuery('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-64 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="relative border-b border-border">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter resolve o caso mais comum sem tirar a mão do teclado:
              // classificar na primeira que casou, ou criar o que foi digitado.
              if (event.key !== 'Enter' || busy) return;
              if (matches.length > 0) void choose(matches[0].name);
              else if (canCreate) void choose(trimmed);
            }}
            placeholder="Buscar ou criar…"
            aria-label="Buscar ou criar categoria"
            className="h-9 rounded-none border-0 pl-9 focus-visible:ring-0"
          />
        </div>

        <div className="max-h-64 overflow-y-auto p-1">
          {matches.map((category) => (
            <button
              key={category.name}
              type="button"
              disabled={busy}
              onClick={() => void choose(category.name)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
            >
              <CheckIcon
                className={cn('size-3.5 shrink-0', category.name === value ? '' : 'opacity-0')}
              />
              <span className="truncate">{capitalize(category.name)}</span>
              <span className="tabular ml-auto shrink-0 text-xs text-muted-foreground">
                {category.purchaseCount || ''}
              </span>
            </button>
          ))}

          {matches.length === 0 && !canCreate && (
            <p className="px-2 py-3 text-sm text-muted-foreground">Nenhuma categoria.</p>
          )}
        </div>

        {canCreate && (
          <div className="border-t border-border p-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void choose(trimmed)}
              className="w-full justify-start font-normal"
            >
              <PlusIcon className="size-4" />
              <span className="truncate">Criar “{trimmed}”</span>
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
