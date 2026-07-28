import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /** Único usuário do app. Presente = sessão autenticada. */
    userId?: string;
  }
}
