import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Envolve a tabela num container que rola na horizontal quando não cabe. */
export function TableWrapper({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('w-full overflow-x-auto', className)} {...props} />;
}

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full caption-bottom text-sm', className)} {...props} />;
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-border', className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn('[&_tr:last-child]:border-0 [&_tr]:border-b [&_tr]:border-border', className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-accent/50', className)} {...props} />;
}

export function TableHead({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'h-10 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...props} />;
}
