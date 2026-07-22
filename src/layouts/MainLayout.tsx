import { Navigate, Outlet } from 'react-router-dom'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useAuth } from '@/features/auth/AuthContext'
import { ROUTES } from '@/lib/routes'
import { Sidebar } from '@/layouts/Sidebar'
import { Header } from '@/layouts/Header'

export function MainLayout() {
  const { isOpen, close, toggle } = useDisclosure(false)
  const { isAdmin, roles } = useAuth()

  // Contratada sem nenhum outro papel tem uma experiência dedicada e mais simples no
  // Portal — a Sidebar corporativa (9 áreas) não faz sentido para esse público externo.
  if (!isAdmin && roles.length > 0 && roles.every((role) => role === 'contratada')) {
    return <Navigate to={ROUTES.portal} replace />
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar isOpen={isOpen} onClose={close} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header onMenuClick={toggle} />
        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
