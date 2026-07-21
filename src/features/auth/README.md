# features/auth

Autenticação (Supabase Auth) e controle de acesso baseado em perfis (RBAC).

**Status:** implementado na Sprint 1.

- `AuthContext.tsx` — `AuthProvider`/`useAuth()`: sessão, perfil, perfis (roles) e permissões resolvidas.
- `authService.ts` — `signIn`, `signOut`, `signUp`, `requestPasswordReset`, `updatePassword`, `fetchMyAccessProfile`.
- `permissions.ts` — funções puras de derivação/checagem de permissões (testadas em `permissions.test.ts`).
- `ProtectedRoute.tsx` — `RequireAuth`, `RequireAdmin`, `RequirePermission`, `RedirectIfAuthenticated` (testados em `ProtectedRoute.test.tsx`).

Estas checagens no frontend são só UX — a autorização real é sempre reforçada por RLS/funções no Postgres (`supabase/migrations/0002_rbac_and_invites.sql`). Ver `docs/architecture.md` (seção Autenticação e RBAC) e `docs/testing.md`.

**Próxima sprint:** quando a tabela `avus` existir, as policies de `avus.view_assigned`/`avus.view_area` (Fiscal/Contratada/Gestor) passam a ter escopo real por linha, usando as mesmas funções `has_permission()`/`has_role()` já criadas aqui.
