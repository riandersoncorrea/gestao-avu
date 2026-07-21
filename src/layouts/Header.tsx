import { Bell, Menu } from 'lucide-react'
import valeLogoPlaceholder from '@/assets/branding/vale-logo.placeholder.svg'

export interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Abrir menu"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
        >
          <Menu className="size-5" />
        </button>
        <div>
          <p className="text-sm font-semibold text-graphite-800">Gestão de AVU</p>
          <p className="text-xs text-gray-500">Serviços Operacionais São Luís EFC</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Notificações"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
        >
          <Bell className="size-5" />
        </button>
        <img src={valeLogoPlaceholder} alt="Vale" className="hidden h-6 w-auto sm:block" />
      </div>
    </header>
  )
}
