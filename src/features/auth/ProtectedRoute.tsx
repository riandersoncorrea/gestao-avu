import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthContext'
import { LoadingState } from '@/components/LoadingState'
import { ROUTES } from '@/lib/routes'
import type { PermissionKey } from '@/types'

/** Bloqueia rotas para quem não está autenticado. Guarda de layout — usar como rota pai. */
export function RequireAuth() {
  const { isLoading, session } = useAuth()
  const location = useLocation()

  if (isLoading) return <LoadingState label="Verificando sessão..." />
  if (!session) return <Navigate to={ROUTES.login} replace state={{ from: location }} />

  return <Outlet />
}

/** Bloqueia rotas para quem já está autenticado (login/cadastro/recuperação de senha). */
export function RedirectIfAuthenticated() {
  const { isLoading, session } = useAuth()

  if (isLoading) return <LoadingState label="Verificando sessão..." />
  if (session) return <Navigate to={ROUTES.dashboard} replace />

  return <Outlet />
}

/** Exige o perfil de Administrador. Só faz sentido aninhado dentro de <RequireAuth />. */
export function RequireAdmin() {
  const { isLoading, isAdmin } = useAuth()

  if (isLoading) return <LoadingState />
  if (!isAdmin) return <Navigate to={ROUTES.forbidden} replace />

  return <Outlet />
}

/**
 * Exige uma permissão específica. Este é um controle de UX (esconder o que o usuário
 * não deveria acessar) — a autorização de verdade é sempre reforçada pelo RLS no Postgres.
 */
export function RequirePermission({ permission }: { permission: PermissionKey }) {
  const { isLoading, hasPermission } = useAuth()

  if (isLoading) return <LoadingState />
  if (!hasPermission(permission)) return <Navigate to={ROUTES.forbidden} replace />

  return <Outlet />
}
