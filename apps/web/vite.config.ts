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
    // Falha em vez de escolher outra porta. Com o fallback ligado, subir um
    // segundo `pnpm dev` sem derrubar o primeiro dava um servidor na 5174 que
    // ninguém abria, enquanto a 5173 continuava servida pela árvore antiga — e
    // o sintoma era testar contra um processo que não era o que se tinha
    // acabado de iniciar. O front também aponta para a API na 3000 por
    // `VITE_API_URL`, então mudar de porta sozinho nunca é o que se quer aqui.
    strictPort: true,
  },
});
