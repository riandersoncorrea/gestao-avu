import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

export interface ProfileOption {
  id: string
  fullName: string
}

/** Lista leve de perfis (id + nome) para seletores — emitente/responsável/fiscal do formulário de AVU. */
export async function listProfileOptions(): Promise<ProfileOption[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name')

  if (error) throw error

  return (data ?? []).map((row) => ({ id: row.id, fullName: row.full_name }))
}

export async function getProfileById(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_active, avatar_url, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    fullName: data.full_name,
    email: data.email,
    isActive: data.is_active,
    avatarUrl: data.avatar_url,
    createdAt: data.created_at,
  }
}
