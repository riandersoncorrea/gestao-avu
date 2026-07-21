import { LayoutDashboard, ListChecks, LogOut } from 'lucide-react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import saoLuisEfcLogo from '@/assets/branding/sao-luis-efc-logo.png'
import { useAuth } from '@/features/auth/AuthContext'
import { signOut } from '@/features/auth/authService'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { label: 'Dashboard', path: ROUTES.portal, icon: LayoutDashboard, end: true },
  { label: 'Meus AVUs', path: `${ROUTES.portal}/avus`, icon: ListChecks, end: false },
]

/** Área dedicada e simplificada para a Contratada acompanhar/executar suas AVUs — fora do
 * MainLayout corporativo (Sidebar de 9 áreas não faz sentido para esse público externo). */
export function PortalLayout() {
  const { isLoading, isAdmin, roles, accessProfile } = useAuth()
  const navigate = useNavigate()

  if (isLoading) return null
  if (!isAdmin && !roles.includes('contratada')) return <Navigate to={ROUTES.dashboard} replace />

  async function handleSignOut() {
    await signOut()
    navigate(ROUTES.login, { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <img src={saoLuisEfcLogo} alt="Serviços Operacionais São Luís EFC" className="h-9 w-auto" />
            <div>
              <p className="text-sm font-semibold text-graphite-800">Portal da Contratada</p>
              <p className="text-xs text-gray-500">{accessProfile?.profile.fullName ?? 'Usuário'}</p>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-primary-50 text-primary-700' : 'text-graphite-600 hover:bg-gray-100',
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-graphite-600 hover:bg-gray-100"
            >
              <LogOut className="size-4" />
              Sair
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  )
}
