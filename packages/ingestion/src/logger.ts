/**
 * Para onde vai o relato da ingestão.
 *
 * Era `console.log` direto no meio do código, o que estava certo enquanto o
 * único cliente era um comando de terminal. Com a API disparando a mesma
 * ingestão, o relato deixou de ser algo para se olhar ao vivo: ninguém está
 * lendo `docker logs` no momento em que clica em "Sincronizar". As mesmas linhas
 * precisam ser guardadas e devolvidas depois — é o que a tela mostra quando a
 * extração falha, e é a única pista sobre um arquivo ignorado por nome fora do
 * padrão.
 */
export interface IngestionLogger {
  info(message: string): void;
  warn(message: string): void;
}

/** O relato ao vivo no terminal: o comportamento do `pnpm extract`. */
export const consoleLogger: IngestionLogger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(`Atenção: ${message}`),
};

/**
 * Um logger que guarda tudo numa lista, para a API devolver o relato junto com o
 * resultado. Os avisos vêm marcados porque perdem o `console.warn` que os
 * distinguia — e o aviso é justamente a linha que interessa reler.
 */
export function collectingLogger(): { logger: IngestionLogger; lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      info: (message) => lines.push(message),
      warn: (message) => lines.push(`Atenção: ${message}`),
    },
  };
}
