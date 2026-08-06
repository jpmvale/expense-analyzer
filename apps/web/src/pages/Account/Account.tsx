import { AlertCircleIcon, CheckCircle2Icon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { changePassword } from '../../api/client';

/** O que dizer depois da troca, incluindo quantos aparelhos caíram. */
function recado(sessionsEncerradas: number): string {
  if (sessionsEncerradas === 0) return 'Senha trocada.';
  return sessionsEncerradas === 1
    ? 'Senha trocada. A outra sessão aberta foi desconectada.'
    : `Senha trocada. As outras ${sessionsEncerradas} sessões abertas foram desconectadas.`;
}

function Account() {
  const { username, email } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const { sessionsEncerradas } = await changePassword(currentPassword, newPassword);
      setDone(recado(sessionsEncerradas));
      setCurrentPassword('');
      setNewPassword('');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Conta" description="Quem você é aqui, e a senha desta conta." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-sm font-medium">Dados da conta</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Usuário</dt>
              <dd>{username}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">E-mail</dt>
              <dd>{email ?? '—'}</dd>
            </div>
          </dl>
          {/* Só as contas criadas antes de o e-mail existir caem aqui. Elas
              funcionam para tudo, menos redefinir a senha — e é melhor a pessoa
              saber disso agora do que no dia em que esquecer a senha. */}
          {!email && (
            <p className="mt-3 text-xs text-muted-foreground">
              Esta conta não tem e-mail cadastrado, então não dá para recuperá-la por "esqueci minha
              senha". Peça a quem administra a instância para cadastrar um.
            </p>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-medium">Trocar a senha</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Trocar desconecta os outros aparelhos onde esta conta estiver aberta. Esta aba continua.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p>{error}</p>
              </div>
            )}

            {done && (
              <div className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <p>{done}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="currentPassword" className="text-sm font-medium">
                Senha atual
              </label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="newPassword" className="text-sm font-medium">
                Senha nova
              </label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">Pelo menos 8 caracteres.</p>
            </div>

            <Button type="submit" disabled={busy}>
              {busy ? 'Salvando…' : 'Trocar senha'}
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}

export default Account;
