import { Connection } from 'mongoose';

/**
 * Apaga as sessões de uma conta, opcionalmente poupando uma.
 *
 * É a metade que falta para trocar de senha significar alguma coisa: sem isto,
 * quem já estava dentro com a senha antiga continua dentro — e "trocar a senha
 * porque ela vazou" vira teatro. Quem poupa a sessão de quem está fazendo a
 * troca é o `exceto`, senão a pessoa se expulsaria ao mudar a própria senha.
 *
 * **Isto conhece o formato do `connect-mongo`**, e não deveria precisar: as
 * sessões vivem na coleção `sessions`, com o conteúdo serializado como JSON no
 * campo `session`, então achar as de um usuário é casar `"userId":"<id>"` dentro
 * dessa string. Se um dia o store mudar de serialização, quem quebra é aqui — e
 * o sintoma seria silencioso, porque apagar zero sessões não dá erro nenhum. É
 * por isso que o teste de integração confere uma sessão paralela caindo de
 * verdade, em vez de confiar na contagem.
 *
 * A alternativa considerada era um `passwordChangedAt` no usuário, conferido
 * pelo guard: robusta, independente do store, e cobrando uma consulta ao banco
 * em **toda** requisição de **toda** rota para uma operação que uma conta faz
 * uma vez por ano.
 */
export async function destroySessions(
  connection: Connection,
  userId: string,
  exceto?: string,
): Promise<number> {
  const db = connection.db;
  if (!db) return 0;

  const filtro: Record<string, unknown> = {
    // O `userId` é gravado como string na sessão, e o JSON não tem espaço depois
    // dos dois-pontos — é a forma exata que o `JSON.stringify` do store produz.
    session: { $regex: `"userId":"${userId}"` },
  };
  if (exceto) filtro._id = { $ne: exceto };

  const result = await db.collection('sessions').deleteMany(filtro);
  return result.deletedCount;
}
