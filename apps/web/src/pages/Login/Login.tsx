import { AlertCircleIcon, WalletIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, type Location } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';

interface FromState {
  from?: Location;
}

type Mode = 'entrar' | 'criar';

/**
 * Entrar e criar conta na mesma tela, alternando por um link.
 *
 * Os dois formulários são o mesmo com um campo a mais — usuário, senha e, no
 * cadastro, o código de convite. Duas rotas separadas custariam uma navegação
 * inteira para trocar de ideia sobre qual dos dois se queria.
 */
function Login() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<Mode>('entrar');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const criando = mode === 'criar';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (criando) {
        await signUp(username, email, password, inviteCode);
      } else {
        await signIn(username, password);
      }
      // Volta para a página que pediu login — quem tentou abrir /rules direto
      // aterrissa em /rules, não sempre em /dashboard.
      const from = (location.state as FromState | null)?.from;
      navigate(from ? `${from.pathname}${from.search}` : '/dashboard', { replace: true });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const trocarModo = () => {
    setMode(criando ? 'entrar' : 'criar');
    setError(null);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6">
        <CardHeader className="items-center p-0 pb-6 text-center">
          <WalletIcon className="mb-2 size-6 text-primary" />
          <CardTitle className="text-base">
            expense<span className="text-muted-foreground">/analyzer</span>
          </CardTitle>
          <CardDescription>
            {criando
              ? 'Crie sua conta para importar suas faturas.'
              : 'Entre para ver suas compras e faturas.'}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p>{error}</p>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm font-medium">
              Usuário
            </label>
            <Input
              id="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>

          {criando && (
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                E-mail
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                É por ele que dá para recuperar a conta se você esquecer a senha.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Senha
            </label>
            <Input
              id="password"
              type="password"
              // Diz ao gerenciador de senhas se é para propor uma nova ou
              // preencher a que já existe — o mesmo campo faz as duas coisas.
              autoComplete={criando ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={criando ? 8 : undefined}
            />
            {criando && <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>}
          </div>

          {criando && (
            <div className="space-y-1.5">
              <label htmlFor="inviteCode" className="text-sm font-medium">
                Código de convite
              </label>
              <Input
                id="inviteCode"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Combinado com quem administra esta instância.
              </p>
            </div>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? (criando ? 'Criando…' : 'Entrando…') : criando ? 'Criar conta' : 'Entrar'}
          </Button>
        </form>

        {!criando && (
          <p className="pt-3 text-center text-sm">
            <Link to="/esqueci" className="text-muted-foreground underline">
              Esqueci minha senha
            </Link>
          </p>
        )}

        <p className="pt-4 text-center text-sm text-muted-foreground">
          {criando ? 'Já tem conta?' : 'Ainda não tem conta?'}{' '}
          <button type="button" onClick={trocarModo} className="font-medium text-primary underline">
            {criando ? 'Entrar' : 'Criar conta'}
          </button>
        </p>
      </Card>
    </div>
  );
}

export default Login;
