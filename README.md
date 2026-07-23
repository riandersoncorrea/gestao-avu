# Gestão de AVU — Serviços Operacionais São Luís EFC

Sistema para centralizar a gestão de AVUs (Análises de Vulnerabilidades): identificação, planejamento, execução, fiscalização e encerramento.

## Stack

Vite + React 19 + TypeScript, Tailwind v4, React Router 7, TanStack Query 5, Supabase (Postgres + Auth + Storage + Edge Functions), MapLibre GL JS. Ver [`docs/architecture.md`](./docs/architecture.md) para detalhes.

## Rodando localmente

```bash
npm install
cp .env.example .env   # opcional — sem isso o app roda em modo demo
npm run dev
```

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — type-check (`tsc -b`) + build de produção
- `npm run lint` — lint (oxlint)
- `npm run test` — testes (Vitest)
- `npm run preview` — pré-visualiza o build de produção

## Configurando o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) e copie a URL do projeto e a `anon key` (Settings → API) para o seu `.env` (ver `.env.example`).
2. Aplique as migrations em `supabase/migrations/` **em ordem** (`0001_...` até a mais recente) via SQL Editor do Supabase ou `npx supabase db push` — não são aplicadas automaticamente. Ver `docs/database.md`.
3. Publique a Edge Function de importação de PDF: `npx supabase functions deploy process-avu-import`. Opcionalmente configure `OPENAI_API_KEY` (classificação por IA) e/ou `OCR_SPACE_API_KEY` (OCR para PDFs sem texto digital) como secrets da function (`npx supabase secrets set ...`) — sem elas o pipeline continua funcionando com um classificador heurístico.

## Deploy

Publicado automaticamente no GitHub Pages a cada push em `main` (`.github/workflows/deploy.yml`), usando `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_MAPTILER_KEY` como Secrets do repositório (Settings → Secrets and variables → Actions). Ver [`docs/deployment.md`](./docs/deployment.md) para a configuração completa (Secrets exigidos, Settings → Pages, etc.).

## Documentação

- [`docs/architecture.md`](./docs/architecture.md) — arquitetura, stack e decisões técnicas
- [`docs/database.md`](./docs/database.md) — schema do banco e RLS
- [`docs/design-system.md`](./docs/design-system.md) — cores, tipografia, componentes
- [`docs/deployment.md`](./docs/deployment.md) — deploy no GitHub Pages
- [`docs/testing.md`](./docs/testing.md) — estratégia e histórico de testes
- [`docs/roadmap.md`](./docs/roadmap.md) — próximas sprints
