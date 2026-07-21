import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'
import { RequireAdmin, RequireAuth, RequirePermission } from './ProtectedRoute'
import type { PermissionKey, RoleSlug } from '@/types'

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '@/features/auth/AuthContext'

const mockedUseAuth = vi.mocked(useAuth)

const FAKE_SESSION = { user: { id: 'user-1' } as User } as Session

interface AuthFixture {
  isLoading?: boolean
  authenticated?: boolean
  roles?: RoleSlug[]
  permissions?: PermissionKey[]
  isAdmin?: boolean
}

function mockAuth({
  isLoading = false,
  authenticated = false,
  roles = [],
  permissions = [],
  isAdmin = false,
}: AuthFixture) {
  mockedUseAuth.mockReturnValue({
    session: authenticated ? FAKE_SESSION : null,
    user: authenticated ? FAKE_SESSION.user : null,
    accessProfile: null,
    isLoading,
    roles,
    permissions,
    isAdmin,
    hasPermission: (key: PermissionKey) => permissions.includes(key),
    refreshAccessProfile: async () => {},
  })
}

/** Reproduz o essencial de app/routes.tsx para testar os guards isoladamente. */
function renderApp(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<div>Tela de login</div>} />
        <Route path="/acesso-negado" element={<div>Acesso negado</div>} />
        <Route element={<RequireAuth />}>
          <Route path="/dashboard" element={<div>Conteúdo do dashboard</div>} />
          <Route element={<RequirePermission permission="avus.view_all" />}>
            <Route path="/avus" element={<div>Conteúdo de AVUs</div>} />
          </Route>
          <Route element={<RequirePermission permission="avus.create" />}>
            <Route path="/avus/novo" element={<div>Formulário de nova AVU</div>} />
          </Route>
          <Route element={<RequireAdmin />}>
            <Route path="/administracao" element={<div>Conteúdo de administração</div>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

// Mesma matriz de permissões semeada em supabase/migrations/0002_rbac_and_invites.sql.
const ROLE_PERMISSIONS: Record<RoleSlug, PermissionKey[]> = {
  admin: [],
  seguranca_empresarial: ['avus.view_all', 'avus.create', 'security.manage', 'history.view'],
  planejamento: ['avus.view_all', 'planning.manage', 'noms.view'],
  fiscal: ['avus.view_assigned', 'evidence.analyze', 'execution.approve'],
  contratada: ['avus.view_assigned', 'evidence.submit'],
  gestor: ['indicators.view', 'avus.view_area'],
  leitor: ['readonly.view'],
}

beforeEach(() => {
  mockedUseAuth.mockReset()
})

describe('RequireAuth', () => {
  it('redireciona para /login um usuário sem autenticação tentando acessar uma rota protegida', () => {
    mockAuth({ authenticated: false })
    renderApp('/dashboard')
    expect(screen.getByText('Tela de login')).toBeInTheDocument()
  })

  it('renderiza a rota para um usuário autenticado', () => {
    mockAuth({ authenticated: true })
    renderApp('/dashboard')
    expect(screen.getByText('Conteúdo do dashboard')).toBeInTheDocument()
  })

  it('mostra estado de carregamento enquanto a sessão ainda está sendo verificada', () => {
    mockAuth({ isLoading: true })
    renderApp('/dashboard')
    expect(screen.queryByText('Conteúdo do dashboard')).not.toBeInTheDocument()
    expect(screen.queryByText('Tela de login')).not.toBeInTheDocument()
  })

  it('tentativa de acesso direto à URL de administração sem sessão também redireciona para /login', () => {
    // MemoryRouter iniciando direto em /administracao (sem navegar pela UI) — simula
    // digitar a URL na barra de endereço ou usar um link direto.
    mockAuth({ authenticated: false })
    renderApp('/administracao')
    expect(screen.getByText('Tela de login')).toBeInTheDocument()
    expect(screen.queryByText('Conteúdo de administração')).not.toBeInTheDocument()
  })
})

describe('RequireAdmin — acesso indevido', () => {
  it('redireciona para /acesso-negado um usuário autenticado que não é admin', () => {
    mockAuth({ authenticated: true, roles: ['leitor'], permissions: ['readonly.view'], isAdmin: false })
    renderApp('/administracao')
    expect(screen.getByText('Acesso negado')).toBeInTheDocument()
    expect(screen.queryByText('Conteúdo de administração')).not.toBeInTheDocument()
  })

  it('permite acesso de administrador', () => {
    mockAuth({ authenticated: true, roles: ['admin'], isAdmin: true })
    renderApp('/administracao')
    expect(screen.getByText('Conteúdo de administração')).toBeInTheDocument()
  })
})

describe('RequirePermission — cada perfil', () => {
  const rolesThatCanViewAllAvus: RoleSlug[] = ['admin', 'seguranca_empresarial', 'planejamento']
  const allRoles = Object.keys(ROLE_PERMISSIONS) as RoleSlug[]

  it.each(allRoles)('perfil "%s"', (role) => {
    const isAdmin = role === 'admin'
    const permissions = isAdmin ? (['avus.view_all'] as PermissionKey[]) : ROLE_PERMISSIONS[role]
    mockAuth({ authenticated: true, roles: [role], permissions, isAdmin })

    renderApp('/avus')

    if (rolesThatCanViewAllAvus.includes(role)) {
      expect(screen.getByText('Conteúdo de AVUs')).toBeInTheDocument()
    } else {
      expect(screen.getByText('Acesso negado')).toBeInTheDocument()
      expect(screen.queryByText('Conteúdo de AVUs')).not.toBeInTheDocument()
    }
  })
})

describe('RequirePermission — criação de AVU (avus.create)', () => {
  // Só Administrador e Segurança Empresarial têm avus.create — todos os outros 5 perfis
  // devem ser barrados em /avus/novo, incluindo Planejamento (que só visualiza).
  const rolesThatCanCreate: RoleSlug[] = ['admin', 'seguranca_empresarial']
  const allRoles = Object.keys(ROLE_PERMISSIONS) as RoleSlug[]

  it.each(allRoles)('perfil "%s"', (role) => {
    const isAdmin = role === 'admin'
    const permissions = isAdmin ? (['avus.create'] as PermissionKey[]) : ROLE_PERMISSIONS[role]
    mockAuth({ authenticated: true, roles: [role], permissions, isAdmin })

    renderApp('/avus/novo')

    if (rolesThatCanCreate.includes(role)) {
      expect(screen.getByText('Formulário de nova AVU')).toBeInTheDocument()
    } else {
      expect(screen.getByText('Acesso negado')).toBeInTheDocument()
      expect(screen.queryByText('Formulário de nova AVU')).not.toBeInTheDocument()
    }
  })

  it('tentativa de acesso direto à URL /avus/novo sem sessão redireciona para /login', () => {
    mockAuth({ authenticated: false })
    renderApp('/avus/novo')
    expect(screen.getByText('Tela de login')).toBeInTheDocument()
    expect(screen.queryByText('Formulário de nova AVU')).not.toBeInTheDocument()
  })
})
