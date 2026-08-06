import { AlertCircleIcon, MailCheckIcon, WalletIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { forgotPassword } from '../../api/client';

/**
 * Pede o link de redefinição.
 *
 * A tela **nunca** diz se o e-mail tem conta — nem em sucesso, nem em erro. A
 * API responde igual nos dois casos de propósito, e uma mensagem diferente aqui
 * jogaria fora essa proteção: bastaria testar endereços para descobrir quem tem
 * conta nesta instância.
 */
function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await forgotPassword(email);
      setEnviado(true);
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
          <CardTitle className="text-base">Esqueci minha senha</CardTitle>
          <CardDescription>
            {enviado
              ? 'Confira sua caixa de entrada.'
              : 'Mandamos um link para você escolher uma senha nova.'}
          </CardDescription>
        </CardHeader>

        {enviado ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-2">
              <MailCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
              <p>
                Se houver uma conta com <span className="font-medium">{email}</span>, o link já está
                a caminho. Ele vale por uma hora e só pode ser usado uma vez.
              </p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Voltar para o login</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                E-mail da conta
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Enviando…' : 'Enviar link'}
            </Button>

            <p className="pt-1 text-center text-sm">
              <Link to="/login" className="text-muted-foreground underline">
                Voltar para o login
              </Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}

export default ForgotPassword;
