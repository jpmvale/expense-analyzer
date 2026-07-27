/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base da API (apps/api). Definida no .env da raiz do repositório. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
