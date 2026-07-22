import { supabase } from '@/lib/supabase'
import type { AppNotification } from '@/types'

interface RawNotificationRow {
  id: string
  user_id: string
  title: string
  body: string
  entity: string | null
  entity_id: string | null
  read_at: string | null
  created_at: string
}

function fromRow(row: RawNotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    entity: row.entity,
    entityId: row.entity_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

export async function listMyNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, title, body, entity, entity_id, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error
  return (data as unknown as RawNotificationRow[]).map(fromRow)
}

/** Lista completa (não limitada a 20) para a página `/notificacoes` — opcionalmente só lidas/não lidas. */
export async function listAllMyNotifications(filter?: 'lidas' | 'nao_lidas'): Promise<AppNotification[]> {
  let query = supabase
    .from('notifications')
    .select('id, user_id, title, body, entity, entity_id, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  if (filter === 'lidas') query = query.not('read_at', 'is', null)
  if (filter === 'nao_lidas') query = query.is('read_at', null)

  const { data, error } = await query
  if (error) throw error
  return (data as unknown as RawNotificationRow[]).map(fromRow)
}

export async function markAsRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function markAllAsRead(unreadIds: string[]): Promise<void> {
  if (unreadIds.length === 0) return
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', unreadIds)
  if (error) throw error
}

export interface DeadlineNotificationsSummary {
  prazoProximo: number
  vencidas: number
}

/**
 * Gera notificações de "prazo próximo"/"AVU vencida" sob demanda (não há pg_cron neste
 * projeto — ver docs/architecture.md). Idempotente no servidor; chamada automaticamente
 * uma vez por sessão pelo `MainLayout` (com throttle) e manualmente pela página de Auditoria.
 */
export async function generateDeadlineNotifications(): Promise<DeadlineNotificationsSummary> {
  const { data, error } = await supabase.rpc('avu_generate_deadline_notifications')
  if (error) throw error
  const result = data as { prazo_proximo: number; vencidas: number }
  return { prazoProximo: result.prazo_proximo, vencidas: result.vencidas }
}
