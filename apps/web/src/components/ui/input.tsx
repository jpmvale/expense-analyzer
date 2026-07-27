import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/utils';

// Com `ref` no tipo, quem monta o campo dentro de um popover consegue focá-lo na
// abertura. No React 19 a ref é uma prop comum de componente de função, então
// basta declará-la — não precisa de `forwardRef`.
export function Input({ className, ...props }: ComponentPropsWithRef<'input'>) {
  return (
    <input
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm',
        'placeholder:text-muted-foreground',
        'transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
