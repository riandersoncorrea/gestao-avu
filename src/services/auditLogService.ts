import { supabase } from '@/lib/supabase'
import type { AuditLog } from '@/types'

interface RawAuditLogRow {
  id: string
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  actor: { full_name: string } | null
}

export interface AuditLogWithActor extends AuditLog {
  actorName: string
}

export async function listAuditLogsForEntity(entity: string, entityId: string): Promise<AuditLogWithActor[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, actor_id, action, entity, entity_id, metadata, created_at, actor:profiles(full_name)')
    .eq('entity', entity)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data as unknown as RawAuditLogRow[]).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    metadata: row.metadata,
    createdAt: row.created_at,
    actorName: row.actor?.full_name ?? 'Sistema',
  }))
}
