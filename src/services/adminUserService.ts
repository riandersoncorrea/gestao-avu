import { supabase } from '@/lib/supabase'
import type { Profile, Role, RoleSlug, UserInvite } from '@/types'

export interface UserWithRoles {
  profile: Profile
  roles: Role[]
}

export interface InviteWithRole extends UserInvite {
  roleName: RoleSlug
}

/**
 * Sem tipos gerados a partir do schema (`supabase gen types`), o client tipa embeds
 * aninhados como array por padrão. Os dois shapes abaixo descrevem o formato real que o
 * PostgREST devolve (role/roles é 1:1 pela FK) — usados só para o cast do resultado bruto.
 */
interface RawUserWithRolesRow {
  id: string
  full_name: string
  email: string
  is_active: boolean
  avatar_url: string | null
  created_at: string
  user_roles: { role: Role | null }[]
}

interface RawInviteRow {
  id: string
  email: string
  role_id: string
  invited_by: string | null
  used_at: string | null
  created_at: string
  role: { name: RoleSlug } | null
}

export async function listRoles(): Promise<Role[]> {
  const { data, error } = await supabase.from('roles').select('id, name, description').order('name')
  if (error) throw error
  return (data ?? []) as Role[]
}

export async function listUsersWithRoles(): Promise<UserWithRoles[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, email, is_active, avatar_url, created_at, user_roles(role:roles(id, name, description))',
    )
    .order('full_name')

  if (error) throw error

  const rows = (data ?? []) as unknown as RawUserWithRolesRow[]

  return rows.map((row) => ({
    profile: {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      isActive: row.is_active,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
    },
    roles: (row.user_roles ?? [])
      .map((ur) => ur.role)
      .filter((role): role is Role => Boolean(role)),
  }))
}

export async function setUserRoles(userId: string, roleIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_roles', {
    target_user_id: userId,
    role_ids: roleIds,
  })
  if (error) throw error
}

export async function setUserActive(userId: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_user_active', {
    target_user_id: userId,
    active,
  })
  if (error) throw error
}

export async function listInvites(): Promise<InviteWithRole[]> {
  const { data, error } = await supabase
    .from('user_invites')
    .select('id, email, role_id, invited_by, used_at, created_at, role:roles(name)')
    .order('created_at', { ascending: false })

  if (error) throw error

  const rows = (data ?? []) as unknown as RawInviteRow[]

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    roleId: row.role_id,
    invitedBy: row.invited_by,
    usedAt: row.used_at,
    createdAt: row.created_at,
    roleName: row.role?.name ?? 'leitor',
  }))
}

export async function createInvite(email: string, roleId: string, invitedBy: string): Promise<void> {
  const { error } = await supabase
    .from('user_invites')
    .insert({ email, role_id: roleId, invited_by: invitedBy })
  if (error) throw error
}

export async function revokeInvite(id: string): Promise<void> {
  const { error } = await supabase.from('user_invites').delete().eq('id', id)
  if (error) throw error
}
