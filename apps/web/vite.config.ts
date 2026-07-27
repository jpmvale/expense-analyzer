import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// O .env é único e mora na raiz do monorepo — `envDir` aponta o Vite pra lá,
// em vez do diretório do app. Só as variáveis com prefixo VITE_ chegam ao bundle.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  envDir: repoRoot,
  server: {
    port: 5173,
    strictPort: false,
  },
});
