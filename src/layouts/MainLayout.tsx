import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useDisclosure } from '@/hooks/useDisclosure'
import { useAuth } from '@/features/auth/AuthContext'
import { ROUTES } from '@/lib/routes'
import { Sidebar } from '@/layouts/Sidebar'
import { Header } from '@/layouts/Header'
import { generateDeadlineNotifications } from '@/services/notificationService'
import { shouldRunDeadlineCheck } from '@/features/avus/deadlineCheckThrottle'

const DEADLINE_CHECK_STORAGE_KEY = 'avu.lastDeadlineCheckAt'

export function MainLayout() {
  const { isOpen, close, toggle } = useDisclosure(false)
  const { isAdmin, roles } = useAuth()

  useEffect(() => {
    const stored = localStorage.getItem(DEADLINE_CHECK_STORAGE_KEY)
    const lastRunAt = stored ? Number(stored) : null
    if (!shouldRunDeadlineCheck(lastRunAt)) return

    localStorage.setItem(DEADLINE_CHECK_STORAGE_KEY, String(Date.now()))
    generateDeadlineNotifications().catch(() => {})
  }, [])

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
