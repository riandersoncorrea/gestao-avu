import { Outlet } from 'react-router-dom'
import { useDisclosure } from '@/hooks/useDisclosure'
import { Sidebar } from '@/layouts/Sidebar'
import { Header } from '@/layouts/Header'

export function MainLayout() {
  const { isOpen, close, toggle } = useDisclosure(false)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar isOpen={isOpen} onClose={close} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={toggle} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
