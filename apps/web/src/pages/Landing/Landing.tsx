import { FileSpreadsheetIcon, RepeatIcon, ScaleIcon, TrendingUpIcon, WalletIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PanelMock } from './panel-mock';

/**
 * O que o app faz que o aplicativo do banco não faz.
 *
 * Os três são escolhidos por isso, e não por serem os maiores: qualquer app de
 * cartão soma gasto por categoria. O que só aparece com anos de série contínua —
 * o reajuste silencioso, o encargo separado do consumo, a categoria que fugiu do
 * próprio padrão — é o que justifica existir um segundo lugar para olhar isso.
 */
const DIFERENCIAIS = [
  {
    Icon: RepeatIcon,
    titulo: 'A assinatura que subiu sem avisar',
    texto:
      'O app detecta as cobranças que se repetem todo mês e monta a escada de preço de cada uma: quando mudou, de quanto para quanto. É o tipo de coisa que só aparece com anos de histórico contínuo.',
  },
  {
    Icon: ScaleIcon,
    titulo: 'Encargo não é gasto',
    texto:
      'Juros, multa e saldo rolado saem do total e ganham linha própria. Somá-los responderia "quanto você gastou" com dinheiro que ninguém gastou.',
  },
  {
    Icon: TrendingUpIcon,
    titulo: 'Fora do normal',
    texto:
      'Cada categoria é comparada contra o próprio histórico, não contra um teto que você teria de configurar. Restaurante em R$ 359 é muito? Depende dos seus últimos doze meses — e é isso que o app olha.',
  },
];

function Landing() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
          <span className="flex items-center gap-2 font-medium tracking-tight">
            <WalletIcon className="size-4 text-primary" />
            <span>
              expense<span className="text-muted-foreground">/analyzer</span>
            </span>
          </span>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">Entrar</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* O hero dá mais espaço à ilustração que ao texto (5 de 12 contra 7): o
          que este app tem de diferente é a série longa, e ela precisa ser vista,
          não descrita. */}
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <section className="grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Tenha visibilidade total dos seus gastos com cartão, de ponta a ponta.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Você manda as faturas em CSV; o app organiza tudo por mês e por categoria e passa a
              responder o que o extrato não responde — qual assinatura subiu de preço, quanto do
              valor da fatura não foi compra sua, e onde este mês fugiu do seu próprio padrão.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/login">Entrar</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/login?criar=1">Criar conta</Link>
              </Button>
            </div>
            {/* Dito aqui, e não depois: sem isto a pessoa descobre que precisa de
                convite no erro, com o formulário já preenchido. */}
            <p className="mt-3 text-sm text-muted-foreground">
              Criar conta precisa de um código de convite — esta instância é fechada.
            </p>
          </div>

          <figure className="m-0 lg:col-span-7">
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <PanelMock />
            </div>
            <figcaption className="mt-3 text-center text-xs text-muted-foreground">
              Ilustração do painel, com números de exemplo.
            </figcaption>
          </figure>
        </section>

        {/* O espaçamento entre as seções varia de propósito: tudo a `mt-16`
            achata a página numa lista de blocos do mesmo peso. */}
        <section className="mt-20 grid gap-4 sm:grid-cols-3">
          {DIFERENCIAIS.map(({ Icon, titulo, texto }) => (
            <Card key={titulo} className="p-5">
              <Icon className="size-5 text-primary" />
              <h2 className="mt-4 text-base font-semibold tracking-tight">{titulo}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{texto}</p>
            </Card>
          ))}
        </section>

        <section className="mt-12">
          <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start">
            <FileSpreadsheetIcon className="size-5 shrink-0 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-medium">O que o app pede de você</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                As faturas do cartão em CSV — o mesmo arquivo que o app do banco exporta, com data,
                título e valor. Você sobe quantos quiser de uma vez pela tela de Importar, e mandar o
                histórico inteiro numa leva só é melhor: a categorização de um mês aproveita o que os
                outros já sabiam. Reenviar um mês sobrescreve o que estava lá, então importar de novo
                nunca duplica nem desfaz o que você classificou.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                A sincronização automática com o Google Drive existe, mas é de quem administra a
                instância — as credenciais são de uma conta Google só.
              </p>
            </div>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>Cada conta vê apenas os próprios dados.</span>
          <a
            href="https://github.com/jpmvale/expense-analyzer"
            className="underline underline-offset-4 hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            Código no GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
