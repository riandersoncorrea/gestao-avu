import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
}

export type RoleSlug =
  | 'admin'
  | 'seguranca_empresarial'
  | 'planejamento'
  | 'fiscal'
  | 'contratada'
  | 'gestor'
  | 'leitor'

export type PermissionKey =
  | 'avus.view_all'
  | 'avus.view_assigned'
  | 'avus.view_area'
  | 'avus.create'
  | 'security.manage'
  | 'history.view'
  | 'planning.manage'
  | 'noms.view'
  | 'evidence.analyze'
  | 'execution.approve'
  | 'evidence.submit'
  | 'indicators.view'
  | 'readonly.view'

export interface Role {
  id: string
  name: RoleSlug
  description: string | null
}

export interface Permission {
  id: string
  key: PermissionKey
  description: string | null
}

export interface Profile {
  id: string
  fullName: string
  email: string
  isActive: boolean
  avatarUrl: string | null
  createdAt: string
}

export interface UserRole {
  userId: string
  roleId: string
  assignedAt: string
}

export interface UserInvite {
  id: string
  email: string
  roleId: string
  invitedBy: string | null
  usedAt: string | null
  createdAt: string
}

/** Perfil + roles + permissões resolvidas, carregado uma vez por sessão pelo AuthProvider. */
export interface AccessProfile {
  profile: Profile
  roles: RoleSlug[]
  permissions: PermissionKey[]
}

export interface AuditLog {
  id: string
  actorId: string | null
  action: string
  entity: string
  entityId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'
