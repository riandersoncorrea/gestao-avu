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

const AUDIT_LOG_SELECT = 'id, actor_id, action, entity, entity_id, metadata, created_at, actor:profiles(full_name)'

function fromRow(row: RawAuditLogRow): AuditLogWithActor {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    metadata: row.metadata,
    createdAt: row.created_at,
    actorName: row.actor?.full_name ?? 'Sistema',
  }
}

export async function listAuditLogsForEntity(entity: string, entityId: string): Promise<AuditLogWithActor[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select(AUDIT_LOG_SELECT)
    .eq('entity', entity)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as unknown as RawAuditLogRow[]).map(fromRow)
}

export interface AuditLogFilters {
  entity?: string
  action?: string
  actorId?: string
  from?: string
  to?: string
}

const AUDIT_LOG_LIST_LIMIT = 500

/**
 * Página de auditoria (`/auditoria`) — lista eventos do sistema inteiro, não só de uma
 * entidade. Paginação é client-side (mesmo padrão de `DataTable`/`listImports`/etc. em
 * todo o resto do app) sobre os `AUDIT_LOG_LIST_LIMIT` mais recentes que batem com os
 * filtros — suficiente para o volume atual; se a tabela crescer muito, o próximo passo é
 * paginação de servidor de verdade (`.range()`), não implementada agora.
 */
export async function listAuditLogsFiltered(filters: AuditLogFilters): Promise<AuditLogWithActor[]> {
  let query = supabase.from('audit_logs').select(AUDIT_LOG_SELECT).order('created_at', { ascending: false }).limit(AUDIT_LOG_LIST_LIMIT)

  if (filters.entity) query = query.eq('entity', filters.entity)
  if (filters.action) query = query.eq('action', filters.action)
  if (filters.actorId) query = query.eq('actor_id', filters.actorId)
  if (filters.from) query = query.gte('created_at', filters.from)
  if (filters.to) query = query.lte('created_at', filters.to)

  const { data, error } = await query
  if (error) throw error
  return (data as unknown as RawAuditLogRow[]).map(fromRow)
}

/** Registra "quem acessou" o detalhe de uma AVU — nunca deve quebrar a página que a chama. */
export async function logAvuAccess(avuId: string): Promise<void> {
  const { error } = await supabase.rpc('log_avu_access', { p_avu_id: avuId })
  if (error) throw error
}

const loggedAvuIdsThisSession = new Set<string>()

/**
 * Mesmo que `logAvuAccess`, mas registra no máximo uma vez por AVU por sessão de navegador
 * (evita duplicar o log a cada re-render/remontagem da página de detalhe). Nunca lança —
 * chamada de dentro de um `useEffect`, onde um erro de rede não deve afetar a página.
 */
export function logAvuAccessOnce(avuId: string): void {
  if (loggedAvuIdsThisSession.has(avuId)) return
  loggedAvuIdsThisSession.add(avuId)
  logAvuAccess(avuId).catch(() => {
    loggedAvuIdsThisSession.delete(avuId)
  })
}
