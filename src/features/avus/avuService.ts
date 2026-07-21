import { supabase } from '@/lib/supabase'
import type {
  Avu,
  AvuAttachment,
  AvuAttachmentKind,
  AvuComment,
  AvuFilters,
  AvuFormValues,
  AvuPriority,
  AvuProfileRef,
  AvuStatus,
  AvuStatusHistoryEntry,
} from './types'

const AVU_SELECT = `
  id, numero_avu, data_criacao, gerencia_responsavel, data_limite, projeto, local,
  latitude, longitude, descricao, categoria, subcategoria, nivel_confianca_ia, status, prioridade,
  empresa_executante, nota_sap, ordem_manutencao, created_at, updated_at,
  emitente:profiles!avus_emitente_fkey(id, full_name),
  responsavel:profiles!avus_responsavel_fkey(id, full_name),
  fiscal:profiles!avus_fiscal_fkey(id, full_name)
`

/** Sem tipos gerados do schema, embeds via FK nomeada vêm tipados como array — ver adminUserService.ts. */
interface RawProfileRef {
  id: string
  full_name: string
}

interface RawAvuRow {
  id: string
  numero_avu: string
  data_criacao: string
  gerencia_responsavel: string | null
  data_limite: string | null
  projeto: string | null
  local: string | null
  latitude: number | null
  longitude: number | null
  descricao: string
  categoria: string | null
  subcategoria: string | null
  nivel_confianca_ia: number | null
  status: AvuStatus
  prioridade: AvuPriority
  empresa_executante: string | null
  nota_sap: string | null
  ordem_manutencao: string | null
  created_at: string
  updated_at: string
  emitente: RawProfileRef | null
  responsavel: RawProfileRef | null
  fiscal: RawProfileRef | null
}

function toProfileRef(raw: RawProfileRef | null): AvuProfileRef | null {
  if (!raw) return null
  return { id: raw.id, fullName: raw.full_name }
}

function fromRow(row: RawAvuRow): Avu {
  return {
    id: row.id,
    numeroAvu: row.numero_avu,
    dataCriacao: row.data_criacao,
    gerenciaResponsavel: row.gerencia_responsavel,
    dataLimite: row.data_limite,
    emitente: toProfileRef(row.emitente),
    projeto: row.projeto,
    local: row.local,
    latitude: row.latitude,
    longitude: row.longitude,
    descricao: row.descricao,
    categoria: row.categoria,
    subcategoria: row.subcategoria,
    nivelConfiancaIa: row.nivel_confianca_ia,
    status: row.status,
    prioridade: row.prioridade,
    responsavel: toProfileRef(row.responsavel),
    empresaExecutante: row.empresa_executante,
    fiscal: toProfileRef(row.fiscal),
    notaSap: row.nota_sap,
    ordemManutencao: row.ordem_manutencao,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statusSince: null,
  }
}

function toNullableNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

function toNullableText(value: string): string | null {
  return value.trim() === '' ? null : value.trim()
}

function toNullableId(value: string): string | null {
  return value.trim() === '' ? null : value
}

function toInsertPayload(values: AvuFormValues) {
  return {
    gerencia_responsavel: toNullableText(values.gerenciaResponsavel),
    data_limite: toNullableText(values.dataLimite),
    emitente: toNullableId(values.emitenteId),
    projeto: toNullableText(values.projeto),
    local: toNullableText(values.local),
    latitude: toNullableNumber(values.latitude),
    longitude: toNullableNumber(values.longitude),
    descricao: values.descricao.trim(),
    categoria: toNullableText(values.categoria),
    subcategoria: toNullableText(values.subcategoria),
    nivel_confianca_ia: toNullableNumber(values.nivelConfiancaIa),
    responsavel: toNullableId(values.responsavelId),
    empresa_executante: toNullableText(values.empresaExecutante),
    fiscal: toNullableId(values.fiscalId),
    nota_sap: toNullableText(values.notaSap),
    ordem_manutencao: toNullableText(values.ordemManutencao),
    prioridade: values.prioridade,
  }
}

export async function listAvus(filters: AvuFilters): Promise<Avu[]> {
  let query = supabase.from('avus').select(AVU_SELECT).order('created_at', { ascending: false })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.categoria) query = query.eq('categoria', filters.categoria)
  if (filters.gerenciaResponsavel) query = query.eq('gerencia_responsavel', filters.gerenciaResponsavel)
  if (filters.projeto) query = query.eq('projeto', filters.projeto)
  if (filters.local) query = query.eq('local', filters.local)
  if (filters.empresaExecutante) query = query.eq('empresa_executante', filters.empresaExecutante)
  if (filters.responsavelId) query = query.eq('responsavel', filters.responsavelId)
  if (filters.periodoInicio) query = query.gte('data_criacao', filters.periodoInicio)
  if (filters.periodoFim) query = query.lte('data_criacao', filters.periodoFim)

  const term = filters.search.trim().replace(/[,()]/g, '')
  if (term) {
    query = query.or(
      `numero_avu.ilike.%${term}%,descricao.ilike.%${term}%,local.ilike.%${term}%,projeto.ilike.%${term}%`,
    )
  }

  const { data, error } = await query
  if (error) throw error

  return (data as unknown as RawAvuRow[]).map(fromRow)
}

export async function getAvuById(id: string): Promise<Avu | null> {
  const { data, error } = await supabase.from('avus').select(AVU_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  return fromRow(data as unknown as RawAvuRow)
}

export async function createAvu(values: AvuFormValues): Promise<Avu> {
  const { data, error } = await supabase
    .from('avus')
    .insert(toInsertPayload(values))
    .select(AVU_SELECT)
    .single()

  if (error) throw error
  return fromRow(data as unknown as RawAvuRow)
}

export async function updateAvu(id: string, values: AvuFormValues): Promise<Avu> {
  const { data, error } = await supabase
    .from('avus')
    .update(toInsertPayload(values))
    .eq('id', id)
    .select(AVU_SELECT)
    .single()

  if (error) throw error
  return fromRow(data as unknown as RawAvuRow)
}

export async function deleteAvu(id: string): Promise<void> {
  const { error } = await supabase.from('avus').delete().eq('id', id)
  if (error) throw error
}

const DISTINCT_VALUE_COLUMNS = ['categoria', 'subcategoria', 'gerencia_responsavel', 'projeto', 'local', 'empresa_executante'] as const
type DistinctValueColumn = (typeof DISTINCT_VALUE_COLUMNS)[number]

/** Valores distintos já usados numa coluna de texto livre — alimenta sugestões do formulário e opções dos filtros. */
export async function listDistinctValues(column: DistinctValueColumn): Promise<string[]> {
  const { data, error } = await supabase.from('avus').select(column).not(column, 'is', null)
  if (error) throw error

  const values = new Set<string>()
  for (const row of (data ?? []) as unknown as Record<DistinctValueColumn, string | null>[]) {
    const value = row[column]
    if (value) values.add(value)
  }
  return [...values].sort()
}

export async function submitEvidence(avuId: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc('avu_submit_evidence', { p_avu_id: avuId, p_note: note ?? null })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Histórico de status (avu_status_history) — fonte rica da timeline
// ---------------------------------------------------------------------------

interface RawStatusHistoryRow {
  id: string
  avu_id: string
  changed_by: string | null
  previous_status: AvuStatus | null
  new_status: AvuStatus
  comment: string | null
  created_at: string
  changed_by_profile: RawProfileRef | null
}

/** Data da última transição de status, ou null se a AVU nunca mudou de status. */
export async function getStatusSince(avuId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('avu_status_history')
    .select('created_at')
    .eq('avu_id', avuId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.created_at ?? null
}

export async function listStatusHistory(avuId: string): Promise<AvuStatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from('avu_status_history')
    .select(
      'id, avu_id, changed_by, previous_status, new_status, comment, created_at, changed_by_profile:profiles!avu_status_history_changed_by_fkey(id, full_name)',
    )
    .eq('avu_id', avuId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data as unknown as RawStatusHistoryRow[]).map((row) => ({
    id: row.id,
    avuId: row.avu_id,
    changedBy: row.changed_by,
    changedByName: row.changed_by_profile?.full_name ?? 'Sistema',
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    comment: row.comment,
    createdAt: row.created_at,
  }))
}

// ---------------------------------------------------------------------------
// Comentários
// ---------------------------------------------------------------------------

interface RawCommentRow {
  id: string
  avu_id: string
  author_id: string | null
  body: string
  created_at: string
  author: RawProfileRef | null
}

export async function listComments(avuId: string): Promise<AvuComment[]> {
  const { data, error } = await supabase
    .from('avu_comments')
    .select('id, avu_id, author_id, body, created_at, author:profiles(id, full_name)')
    .eq('avu_id', avuId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data as unknown as RawCommentRow[]).map((row) => ({
    id: row.id,
    avuId: row.avu_id,
    authorId: row.author_id,
    authorName: row.author?.full_name ?? 'Usuário removido',
    body: row.body,
    createdAt: row.created_at,
  }))
}

export async function addComment(avuId: string, authorId: string, body: string): Promise<void> {
  const { error } = await supabase.from('avu_comments').insert({ avu_id: avuId, author_id: authorId, body })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Anexos (Documentos / Fotos) — Supabase Storage
// ---------------------------------------------------------------------------

const ATTACHMENTS_BUCKET = 'avu-attachments'

export async function listAttachments(avuId: string, kind: AvuAttachmentKind): Promise<AvuAttachment[]> {
  const { data, error } = await supabase
    .from('avu_attachments')
    .select('id, avu_id, kind, file_path, file_name, mime_type, size_bytes, uploaded_by, created_at')
    .eq('avu_id', avuId)
    .eq('kind', kind)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) => ({
    id: row.id,
    avuId: row.avu_id,
    kind: row.kind as AvuAttachmentKind,
    filePath: row.file_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  }))
}

export async function uploadAttachment(
  avuId: string,
  kind: AvuAttachmentKind,
  file: File,
  uploadedBy: string,
): Promise<void> {
  const path = `${avuId}/${crypto.randomUUID()}-${file.name}`

  const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file)
  if (uploadError) throw uploadError

  const { error: insertError } = await supabase.from('avu_attachments').insert({
    avu_id: avuId,
    kind,
    file_path: path,
    file_name: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: uploadedBy,
  })

  if (insertError) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path])
    throw insertError
  }
}

export async function getAttachmentUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(filePath, 60 * 10)
  if (error) throw error
  return data.signedUrl
}

export async function deleteAttachment(id: string, filePath: string): Promise<void> {
  const { error: storageError } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove([filePath])
  if (storageError) throw storageError

  const { error } = await supabase.from('avu_attachments').delete().eq('id', id)
  if (error) throw error
}
