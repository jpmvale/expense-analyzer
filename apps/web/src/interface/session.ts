/** Quem está na sessão, como `GET /auth/session` devolve. */
export interface Session {
  authenticated: boolean;
  username: string | null;
  /**
   * Para onde vai o link de redefinição de senha. `null` nas contas criadas
   * antes de o campo existir — elas funcionam para tudo, menos redefinir.
   */
  email: string | null;
  /**
   * Se esta conta é a dona da instância.
   *
   * É o que decide se o botão Sincronizar existe na tela: a sincronização lê as
   * faturas de um Google Drive com credenciais configuradas no servidor, e essas
   * são de uma pessoa só. As demais contas importam CSV pela tela de Importar.
   */
  isOwner: boolean;
}
