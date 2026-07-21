import type { PermissionKey } from '@/types'

/**
 * Espelha can_write_avu_related() do banco (supabase/migrations/0003_avus.sql) — só para
 * decidir o que mostrar na UI (esconder o formulário de comentário/anexo do Leitor). A
 * autorização de verdade é sempre a RLS/RPC no Postgres, não esta função.
 */
export function canWriteAvuRelated(permissions: PermissionKey[], isAdmin: boolean): boolean {
  return (
    isAdmin ||
    permissions.includes('avus.view_all') ||
    permissions.includes('avus.view_assigned') ||
    permissions.includes('avus.view_area')
  )
}
