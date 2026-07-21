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
