import { supabase } from '@/lib/supabase'
import { derivePermissionSet, type RawUserRoleRow } from '@/features/auth/permissions'
import { ROUTES } from '@/lib/routes'
import type { AccessProfile, Profile } from '@/types'

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profileRow && !profileRow.is_active) {
    await supabase.auth.signOut()
    throw new Error('Sua conta está desativada. Contate o administrador do sistema.')
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function signUp(params: { fullName: string; email: string; password: string }) {
  const { error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: { data: { full_name: params.fullName } },
  })
  if (error) throw error
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // `BASE_URL` já é "/" em dev e "/gestao-avu/" no build de produção (ver vite.config.ts) —
    // sem isso, o link do e-mail apontaria pra raiz do domínio, ignorando o subcaminho do
    // GitHub Pages. `ROUTES.resetPassword` tem uma barra inicial e `BASE_URL` sempre termina em
    // barra, por isso o `.slice(1)` evita duplicar a barra na concatenação.
    redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}${ROUTES.resetPassword.slice(1)}`,
  })
  if (error) throw error
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

/**
 * Carrega perfil + perfis(roles) + permissões resolvidas do usuário autenticado.
 * Fonte de verdade é sempre o banco (RLS) — isto só existe para a UI decidir o que mostrar,
 * nunca para autorizar operações sensíveis (isso é reforçado nas policies/RPCs do Postgres).
 */
export async function fetchMyAccessProfile(userId: string): Promise<AccessProfile | null> {
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_active, avatar_url, created_at')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) throw profileError
  if (!profileRow) return null

  const profile: Profile = {
    id: profileRow.id,
    fullName: profileRow.full_name,
    email: profileRow.email,
    isActive: profileRow.is_active,
    avatarUrl: profileRow.avatar_url,
    createdAt: profileRow.created_at,
  }

  const { data: roleRows, error: rolesError } = await supabase
    .from('user_roles')
    .select('role:roles(name, role_permissions(permissions(key)))')
    .eq('user_id', userId)

  if (rolesError) throw rolesError

  const { roles, permissions } = derivePermissionSet((roleRows ?? []) as unknown as RawUserRoleRow[])

  return { profile, roles, permissions }
}
