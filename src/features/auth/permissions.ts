import type { PermissionKey, RoleSlug } from '@/types'

export const ROLE_LABELS: Record<RoleSlug, string> = {
  admin: 'Administrador',
  seguranca_empresarial: 'Segurança Empresarial',
  planejamento: 'Planejamento',
  fiscal: 'Fiscal',
  contratada: 'Contratada',
  gestor: 'Gestor',
  leitor: 'Leitor',
}

export const ALL_ROLE_SLUGS: RoleSlug[] = [
  'admin',
  'seguranca_empresarial',
  'planejamento',
  'fiscal',
  'contratada',
  'gestor',
  'leitor',
]

/** Formato retornado por um select aninhado de user_roles -> roles -> role_permissions -> permissions. */
export interface RawUserRoleRow {
  role: {
    name: string
    role_permissions: { permissions: { key: string } | null }[]
  } | null
}

export interface ResolvedAccess {
  roles: RoleSlug[]
  permissions: PermissionKey[]
}

/** Deriva perfis + permissões a partir das linhas brutas vindas do Supabase. Pura, sem I/O. */
export function derivePermissionSet(rows: RawUserRoleRow[]): ResolvedAccess {
  const roles = new Set<RoleSlug>()
  const permissions = new Set<PermissionKey>()

  for (const row of rows) {
    if (!row.role) continue
    roles.add(row.role.name as RoleSlug)

    for (const rp of row.role.role_permissions) {
      if (rp.permissions?.key) permissions.add(rp.permissions.key as PermissionKey)
    }
  }

  // Administrador tem acesso total, independentemente do que estiver semeado em role_permissions.
  if (roles.has('admin')) {
    for (const key of ALL_PERMISSION_KEYS) permissions.add(key)
  }

  return { roles: [...roles], permissions: [...permissions] }
}

export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  'avus.view_all',
  'avus.view_assigned',
  'avus.view_area',
  'avus.create',
  'security.manage',
  'history.view',
  'planning.manage',
  'noms.view',
  'evidence.analyze',
  'execution.approve',
  'evidence.submit',
  'indicators.view',
  'readonly.view',
]

export function hasPermission(permissions: PermissionKey[], key: PermissionKey): boolean {
  return permissions.includes(key)
}

export function hasRole(roles: RoleSlug[], slug: RoleSlug): boolean {
  return roles.includes(slug)
}

export function isAdmin(roles: RoleSlug[]): boolean {
  return hasRole(roles, 'admin')
}
