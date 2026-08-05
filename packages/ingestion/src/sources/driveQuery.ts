/**
 * Restringe uma busca do Drive aos arquivos vivos.
 *
 * O `files.list` inclui a lixeira por padrão: um arquivo apagado continua sendo
 * devolvido até ser removido em definitivo. Sem isto, apagar uma fatura duplicada
 * no Drive não tem efeito nenhum aqui — ela volta na próxima extração e, como
 * cada fatura apaga o mês antes de gravar, sobrescreve a boa em silêncio.
 *
 * O filtro do usuário vai entre parênteses porque ele pode conter `or`, e sem os
 * parênteses o `and` teria precedência sobre parte da expressão.
 *
 * Mora num módulo separado do `drive.ts` de propósito: aquele importa o `config`,
 * que exige MONGO_URI já na carga do módulo, e um teste desta função não deveria
 * precisar de um .env configurado.
 */
export function excludeTrashed(query: string): string {
  return `(${query}) and trashed = false`;
}
