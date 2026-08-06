import { AlertCircleIcon, WalletIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { resetPassword } from '../../api/client';

/**
 * O outro lado do link do e-mail: escolher a senha nova.
 *
 * O token vem na query string, e não é guardado em lugar nenhum — some da aba
 * junto com a navegação. Depois de redefinir, a tela manda para o login em vez
 * de abrir a sessão sozinha: quem redefiniu acabou de provar que tem a caixa de
 * entrada, não que lembra a senha, e digitá-la uma vez fecha o ciclo.
 */
function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await resetPassword(token, password);
      navigate('/login', { replace: true, state: { senhaRedefinida: true } });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6">
        <CardHeader className="items-center p-0 pb-6 text-center">
          <WalletIcon className="mb-2 size-6 text-primary" />
          <CardTitle className="text-base">Escolha uma senha nova</CardTitle>
          <CardDescription>
            Trocar a senha desconecta a conta de todos os outros aparelhos.
          </CardDescription>
        </CardHeader>

        {token === '' ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p>
                Este endereço não tem token de redefinição. Abra o link direto do e-mail, ou peça um
                novo.
              </p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link to="/esqueci">Pedir um link novo</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm">
                  <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p>{error}</p>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/esqueci">Pedir um link novo</Link>
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Senha nova
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                autoFocus
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
            </div>

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Salvando…' : 'Salvar senha'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}

export default ResetPassword;
