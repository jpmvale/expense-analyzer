import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// O .env é único e mora na raiz do monorepo — `envDir` aponta o Vite pra lá,
// em vez do diretório do app. Só as variáveis com prefixo VITE_ chegam ao bundle.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: repoRoot,
  resolve: {
    // `@/` aponta para src/ — é o alias que os componentes do shadcn assumem.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
