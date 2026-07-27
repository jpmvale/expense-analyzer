import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  Icon?: LucideIcon;
  loading?: boolean;
  className?: string;
}

export function StatCard({ label, value, hint, Icon, loading, className }: StatCardProps) {
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        <p className="tabular mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
      )}
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}
