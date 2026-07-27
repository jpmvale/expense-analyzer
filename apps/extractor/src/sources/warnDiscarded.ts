/**
 * Avisa quando um arquivo teve linhas descartadas.
 *
 * O parser ignora linhas sem título, data ou valor utilizável. Isso é correto —
 * fatura tem cabeçalho, rodapé e linha em branco —, mas antes acontecia calado, e
 * foi assim que 55 lançamentos em formato brasileiro passaram meses fora da base:
 * o sintoma visível era uma coluna vazia na tela, a três camadas de distância da
 * causa. Uma linha ou duas por arquivo é o normal; um punhado merece um olhar.
 */
export function warnDiscarded(fileName: string, discarded: number): void {
  if (discarded === 0) return;

  console.warn(
    `  ${fileName}: ${discarded} ${discarded === 1 ? 'linha ignorada' : 'linhas ignoradas'} ` +
      '(sem título, data ou valor legível).',
  );
}
