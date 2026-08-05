import {
  FileTextIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  LogOutIcon,
  MenuIcon,
  ReceiptTextIcon,
  RepeatIcon,
  TagsIcon,
  WalletIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { SyncButton } from '@/components/sync-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/dashboard', label: 'Visão geral', Icon: LayoutDashboardIcon },
  { to: '/purchases', label: 'Compras', Icon: ReceiptTextIcon },
  { to: '/bills', label: 'Faturas', Icon: FileTextIcon },
  { to: '/recurring', label: 'Assinaturas', Icon: RepeatIcon },
  { to: '/uncategorized', label: 'Sem categoria', Icon: TagsIcon },
  { to: '/rules', label: 'Regras', Icon: ListChecksIcon },
];

function Wordmark() {
  return (
    <NavLink to="/" className="flex items-center gap-2 font-medium tracking-tight">
      <WalletIcon className="size-4 text-primary" />
      <span>
        expense<span className="text-muted-foreground">/analyzer</span>
      </span>
    </NavLink>
  );
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
          {/* Mobile: menu antes do wordmark, como manda o hábito de leitura. */}
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left">
              <SheetTitle className="text-sm font-medium">
                <Wordmark />
              </SheetTitle>
              <nav className="mt-2 flex flex-col gap-1">
                {NAV.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-accent font-medium text-foreground'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                      )
                    }
                  >
                    <Icon className="size-4" />
                    {label}
                  </NavLink>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <div className="text-sm">
            <Wordmark />
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <SyncButton />
            <ThemeToggle />
            <Button variant="ghost" size="icon" aria-label="Sair" title="Sair" onClick={handleSignOut}>
              <LogOutIcon />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}

/** Cabeçalho de página: título, opcionalmente uma linha de apoio, e uma ação à direita. */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
