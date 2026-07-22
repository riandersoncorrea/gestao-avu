import {
  ClipboardCheck,
  Database,
  FileBarChart,
  HardHat,
  LayoutDashboard,
  LogOut,
  Map,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import type { NavItem } from '@/types'
import saoLuisEfcLogo from '@/assets/branding/sao-luis-efc-logo.png'
import { useAuth } from '@/features/auth/AuthContext'
import { signOut } from '@/features/auth/authService'
import { ROLE_LABELS } from '@/features/auth/permissions'

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: ROUTES.dashboard, icon: LayoutDashboard },
  { label: 'AVUs', path: ROUTES.avus, icon: ShieldAlert },
  { label: 'Planejamento', path: ROUTES.planning, icon: CalendarClock },
  { label: 'Mapa', path: ROUTES.map, icon: Map },
  { label: 'Contratadas', path: ROUTES.contractors, icon: HardHat },
  { label: 'Relatórios', path: ROUTES.reports, icon: FileBarChart },
]

const INSPECTIONS_ITEM: NavItem = { label: 'Fiscalização', path: ROUTES.inspections, icon: ClipboardCheck }
const IMPORTS_ITEM: NavItem = { label: 'Importações', path: ROUTES.imports, icon: Upload }
const SAP_IMPORTS_ITEM: NavItem = { label: 'Importação SAP', path: ROUTES.sapImports, icon: Database }
const AUDIT_LOG_ITEM: NavItem = { label: 'Auditoria', path: ROUTES.auditLog, icon: ShieldCheck }
const ADMIN_ITEM: NavItem = { label: 'Administração', path: ROUTES.admin, icon: Settings }

export interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const navigate = useNavigate()
  const { accessProfile, roles, isAdmin, hasPermission } = useAuth()
  const navItems = [
    ...NAV_ITEMS,
    ...(isAdmin || hasPermission('evidence.analyze') ? [INSPECTIONS_ITEM] : []),
    ...(isAdmin || hasPermission('avus.create') ? [IMPORTS_ITEM, SAP_IMPORTS_ITEM] : []),
    ...(isAdmin || hasPermission('history.view') ? [AUDIT_LOG_ITEM] : []),
    ...(isAdmin ? [ADMIN_ITEM] : []),
  ]

  async function handleSignOut() {
    await signOut()
    navigate(ROUTES.login, { replace: true })
  }

  const initials = accessProfile?.profile.fullName
    ? accessProfile.profile.fullName
        .split(' ')
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase()
    : '?'

  const primaryRoleLabel = roles[0] ? ROLE_LABELS[roles[0]] : 'Sem perfil'

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-graphite-900/50 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          // `h-dvh` em vez de `h-screen` — mesmo motivo do MainLayout: acompanha o viewport
          // visual real em navegadores móveis (barra de endereço recolhendo/expandindo).
          'fixed inset-y-0 left-0 z-50 flex h-dvh w-72 flex-col border-r border-gray-200 bg-white transition-transform',
          'lg:static lg:z-0 lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-5 py-5">
          <img
            src={saoLuisEfcLogo}
            alt="Serviços Operacionais São Luís EFC"
            className="h-14 w-35"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <SidebarLink key={item.path} item={item} onNavigate={onClose} />
          ))}
        </nav>

        <div className="shrink-0 border-t border-gray-100 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-graphite-800">
                {accessProfile?.profile.fullName ?? 'Usuário'}
              </p>
              <p className="truncate text-xs text-gray-500">{primaryRoleLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-magenta-600"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </div>
      </aside>
    </>
  )
}

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const Icon: LucideIcon = item.icon

  return (
    <NavLink
      to={item.path}
      end={item.path === ROUTES.dashboard}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary-50 text-primary-700'
            : 'text-graphite-600 hover:bg-gray-50 hover:text-graphite-800',
        )
      }
    >
      <Icon className="size-4" />
      {item.label}
    </NavLink>
  )
}
