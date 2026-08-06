import { AlertCircleIcon, CheckCircle2Icon, RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { SyncRun, SyncStatus } from '@/interface/sync';
import { cn, timeAgo } from '@/lib/utils';
import { getSyncStatus, startSync } from '../api/client';

/**
 * De quanto em quanto tempo a tela pergunta se a extração já acabou.
 *
 * Só enquanto ela está rodando — parada, o intervalo é desligado. Uma extração
 * das 95 faturas leva perto de um minuto, então dois segundos dão trinta
 * consultas baratas e uma resposta que parece imediata; um `setInterval` que
 * ficasse ligado o tempo todo bateria na API sozinho a noite inteira com uma aba
 * esquecida aberta.
 */
const POLL_MS = 2000;

function triggerLabel(run: SyncRun): string {
  if (run.trigger === 'manual') return 'pelo botão';
  if (run.trigger === 'upload') return 'pelo envio de CSVs';
  return 'pela linha de comando';
}

/** O resumo de uma execução que deu certo, sem despejar os seis números. */
function summary(run: SyncRun): string {
  if (!run.bills) return 'nenhuma fatura encontrada na fonte';

  const bills = `${run.bills} ${run.bills === 1 ? 'fatura' : 'faturas'}`;
  return `${bills}, ${run.purchases ?? 0} compras`;
}

function StatusLine({ status }: { status: SyncStatus }) {
  if (status.running) {
    return (
      <p className="text-sm">
        Lendo as faturas e regravando os meses. Pode levar cerca de um minuto.
      </p>
    );
  }

  const run = status.lastRun;
  if (!run) {
    return (
      <p className="text-sm text-muted-foreground">
        Nunca sincronizado. As faturas que estão na fonte ainda não foram lidas.
      </p>
    );
  }

  if (run.status === 'error') {
    return (
      <div className="flex gap-2 text-sm">
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">Falhou {timeAgo(run.startedAt)}</p>
          <p className="mt-1 whitespace-pre-line text-muted-foreground">{run.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 text-sm">
      <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <p className="font-medium" title={new Date(run.startedAt).toLocaleString('pt-BR')}>
          Sincronizado {timeAgo(run.startedAt)}
        </p>
        <p className="mt-1 text-muted-foreground">
          {summary(run)} · {triggerLabel(run)}
        </p>
      </div>
    </div>
  );
}

/**
 * Os avisos da última execução.
 *
 * São o motivo de o relato ser guardado: nenhum deles é erro, nenhum aparece nas
 * contagens, e todos significam que alguma fatura não entrou como se esperava —
 * um arquivo com nome fora do padrão `<ano>-<mês>`, dois arquivos disputando o
 * mesmo mês, linhas sem valor legível. No terminal passavam na frente de quem
 * rodava o comando; pelo botão, sem isto, não apareceriam em lugar nenhum.
 */
function Warnings({ run }: { run: SyncRun }) {
  const warnings = (run.log ?? []).filter((line) => line.startsWith('Atenção:'));
  if (warnings.length === 0) return null;

  return (
    <ul className="mt-3 space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
      {warnings.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/**
 * Dispara a ingestão e conta o que aconteceu com ela.
 *
 * Existe porque, até então, a única resposta para "quando a app vai ler a fatura
 * que eu acabei de colocar no Drive?" era "quando alguém rodar `pnpm extract` por
 * SSH". A tela não tinha como pedir, e — pior — não tinha como dizer que estava
 * desatualizada: uma base parada e uma base em dia eram visualmente idênticas.
 */
export function SyncButton() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [finished, setFinished] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getSyncStatus());
    } catch (cause) {
      setError((cause as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = status?.running ?? false;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [running, refresh]);

  // A transição de "rodando" para "parado" é o que libera o convite a recarregar.
  // Sem guardar o estado anterior não dá para distinguir "acabou agora" de
  // "estava parado desde antes de eu abrir a tela".
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) setFinished(true);
    wasRunning.current = running;
  }, [running]);

  const start = async () => {
    setStarting(true);
    setError(null);
    setFinished(false);
    try {
      setStatus(await startSync());
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const lastRun = status?.lastRun ?? null;
  const stale = lastRun?.status === 'error';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sincronização das faturas"
          title={
            running
              ? 'Sincronizando...'
              : lastRun
                ? `Sincronizado ${timeAgo(lastRun.startedAt)}`
                : 'Nunca sincronizado'
          }
        >
          <RefreshCwIcon
            className={cn(running && 'animate-spin', stale && !running && 'text-destructive')}
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-3">
        {status ? <StatusLine status={status} /> : <p className="text-sm">Carregando...</p>}
        {lastRun && !running ? <Warnings run={lastRun} /> : null}

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void start()} disabled={running || starting}>
            {running ? 'Sincronizando...' : 'Sincronizar agora'}
          </Button>

          {/*
            Recarregar é explícito, e não automático no fim da extração: as telas
            guardam o próprio estado, e uma delas é a de classificar sem
            categoria, onde um recarregamento no meio do caminho jogaria fora a
            regra que a pessoa estava montando.
          */}
          {finished && !running ? (
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Atualizar a tela
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
