/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages publica em https://riandersoncorrea.github.io/gestao-avu/ (subcaminho, não raiz)
  // — só se aplica ao build de produção; `npm run dev` continua servindo em "/" normalmente,
  // sem exigir navegar para /gestao-avu/ localmente. `import.meta.env.BASE_URL` (usado no
  // `basename` do router e no redirect de recuperação de senha) reflete este valor automaticamente.
  base: command === 'build' ? '/gestao-avu/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
}))
