import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /**
     * O `_id` do usuário na coleção `users`, em string. Presente = sessão
     * autenticada.
     *
     * Já foi o nome do usuário, quando havia um só e ele morava no `.env`. É o
     * `_id` desde que as contas viraram documentos, para que renomear uma conta
     * não obrigue a reescrever o dono de cada compra.
     */
    userId?: string;
  }
}
