# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # dev server (Vite)
npm run build     # tsc -b (type-check) + vite build — build fails on type errors
npm run lint      # oxlint (not ESLint)
npm run test      # vitest run — all tests, once
npm run preview   # preview a production build
```

Run a single test file: `npx vitest run src/features/avus/sla.test.ts`
Run tests matching a name: `npx vitest run -t "Fiscal"`

There is no watch-mode script configured; `npx vitest` (no `run`) starts watch mode ad hoc.

Local setup: `cp .env.example .env` and fill `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. Without them the app still boots (points at a placeholder project) but no Supabase call succeeds.

## Git & GitHub sync

This working directory is a git repo tracking `origin` = `https://github.com/riandersoncorrea/gestao-avu` (branch `main`). A `Stop` hook in `.claude/settings.json` runs after every Claude Code turn: it stages all changes, and — only if there's something to commit — commits with an auto-generated timestamp message and pushes to `origin/main`. No-op (silent) when the working tree is already clean.

`.claude/settings.local.json` and `.claude/scheduled_tasks.lock` are gitignored — they're machine-local Claude Code state, not project config.

## Architecture

Full docs live in `docs/` (`architecture.md`, `database.md`, `design-system.md`, `testing.md`, `roadmap.md`) — read those before making structural changes. The summary below is what you need to not re-derive from scratch.

### Stack

Vite 8 + React 19 + TypeScript, Tailwind v4 (CSS-first config in `src/index.css` via `@theme` — there is no `tailwind.config.ts`), React Router 7 (`createBrowserRouter`), TanStack Query 5, React Hook Form + Zod, Supabase (Postgres + Auth + Storage), MapLibre GL JS (not Leaflet — chosen for future vector-tile GIS layers), Vitest + Testing Library.

### Folder structure and dependency rule

```
src/
  app/          # App.tsx (providers), routes.tsx (route tree)
  components/   # generic UI kit — must not import from features/ or pages/
  features/     # one folder per business domain (auth, avus, gis, ...)
  layouts/      # MainLayout, Sidebar, Header
  pages/        # one file per route — composes features/ + components/
  services/     # data access (Supabase calls) not tied to one feature
  lib/          # infra: supabase client, cn(), route path constants
  types/        # cross-cutting types
supabase/migrations/   # sequential, numbered SQL — see below
```

`features/*` may import `components/`, `lib/`, `services/`, `types/`. `pages/*` composes `features/*` and `components/*`. Never the reverse.

### Authorization model — the thing spanning the most files

**The frontend never authorizes anything.** Every permission check in React (`useAuth().hasPermission()`, `RequirePermission`/`RequireAdmin`/`RequireAuth` route guards in `src/features/auth/ProtectedRoute.tsx`, hiding a button) is UX only. The real boundary is Postgres RLS plus a family of `security definer` SQL functions: `is_admin()`, `has_role()`, `has_permission()` (auth-level, `0002_rbac_and_invites.sql`) and `can_view_avu()` / `can_write_avu_related()` (row-level scoping for the `avus` domain, `0003_avus.sql`). When adding a new protected resource, add the DB policy/function first; the client-side check is just a mirror of it for UX (see `src/features/avus/permissions.ts` — literally a JS re-implementation of `can_write_avu_related()` for hiding UI, with a comment saying so).

Sensitive multi-step actions (e.g. `avu_submit_evidence`, `avu_review_execution`, `admin_set_user_roles`) are Postgres RPCs, not generic `UPDATE` policies — each RPC re-checks the caller's authorization internally and writes its own `audit_logs` row, so a compromised or hand-crafted `supabase.rpc()` call from the client still can't do anything the RPC doesn't explicitly allow.

7 roles (`admin`, `seguranca_empresarial`, `planejamento`, `fiscal`, `contratada`, `gestor`, `leitor`) are many-to-many via `user_roles` (a user can hold more than one). Role → permission mapping is seeded in `0002_rbac_and_invites.sql` and duplicated as a plain object in `src/features/auth/ProtectedRoute.test.tsx` for test fixtures — keep both in sync if the seed changes.

Sign-up is invite-gated entirely in the database (no `service_role` key ever touches the client): `handle_new_user()` raises an exception (aborting the whole `auth.users` insert) unless a matching `user_invites` row exists — except for the very first user in the system, who bootstraps as `admin` automatically.

### Supabase migrations

Numbered and sequential (`0001_init.sql`, `0002_rbac_and_invites.sql`, `0003_avus.sql`, ...) — always apply in order, never edit an already-applied one. There is no Supabase CLI link configured in this environment; migrations are applied by hand (Supabase SQL Editor or `npx supabase db push` after `npx supabase login`).

Nested Supabase selects that embed the same foreign table via more than one FK (e.g. `avus` → `profiles` through `emitente`/`responsavel`/`fiscal`) require naming the FK constraint explicitly in the select string (`profiles!avus_fiscal_fkey(...)`) since there's no generated `Database` type to disambiguate automatically. Grep `avuService.ts` for the pattern before adding a similar join.

### Testing approach

Vitest covers pure logic and React Router guards with no network: `src/features/auth/permissions.test.ts`, `src/features/avus/sla.test.ts`, `src/features/auth/ProtectedRoute.test.tsx` (mocks `useAuth`, renders route trees in a `MemoryRouter`). RLS itself is verified with raw SQL run in the Supabase SQL Editor (see `docs/testing.md`), impersonating a role via `select set_config('request.jwt.claims', ...)` + `set local role authenticated`, always inside `begin; ... rollback;` — there's no seeded test-user fixture, so ad hoc verification reassigns roles to whatever real profile exists and rolls the transaction back.
