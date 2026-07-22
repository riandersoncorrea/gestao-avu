import { supabase } from '@/lib/supabase'
import { listProfileOptions } from '@/services/profileService'
import type { Avu, AvuPriority, AvuProfileRef, AvuStatus } from '@/features/avus/types'
import type { ApprovalDecision, AvuApproval, FiscalizacaoBucket } from './types'

/**
 * Traduz cada bucket da página de Fiscalização num filtro sobre `avu_fiscalizacao_view`.
 * "Reprovados" não pode ser um filtro de `status` — reprovar manda a AVU direto para
 * EM_EXECUCAO (não para REPROVADO), então o único jeito de saber "isso foi reprovado" é
 * olhar a última decisão registrada em `avu_approvals` (`latest_decision`, trazida pela view).
 */
export function mapBucketToQuery(bucket: FiscalizacaoBucket): { status: AvuStatus } | { latestDecision: ApprovalDecision } {
  switch (bucket) {
    case 'aguardando_aprovacao':
      return { status: 'AGUARDANDO_APROVACAO' }
    case 'aguardando_complementacao':
      return { status: 'AGUARDANDO_EVIDENCIAS' }
    case 'aprovados':
      return { status: 'CONCLUIDO' }
    case 'reprovados':
      return { latestDecision: 'reprovado' }
  }
}

/** Mesma estratégia de `planningService.listAvusForPlanning`: lê de uma view (aqui,
 * `avu_fiscalizacao_view`) e resolve emitente/responsável/fiscal via mapa de perfis
 * carregado à parte, já que embeds de FK do PostgREST não são garantidos através de views. */
interface RawFiscalizacaoRow {
  id: string
  numero_avu: string
  data_criacao: string
  gerencia_responsavel: string | null
  data_limite: string | null
  emitente: string | null
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
  responsavel: string | null
  empresa_executante: string | null
  fiscal: string | null
  nota_sap: string | null
  ordem_manutencao: string | null
  created_at: string
  updated_at: string
}

function toProfileRef(id: string | null, names: Map<string, string>): AvuProfileRef | null {
  if (!id) return null
  return { id, fullName: names.get(id) ?? 'Usuário removido' }
}

function fromViewRow(row: RawFiscalizacaoRow, names: Map<string, string>): Avu {
  return {
    id: row.id,
    numeroAvu: row.numero_avu,
    dataCriacao: row.data_criacao,
    gerenciaResponsavel: row.gerencia_responsavel,
    dataLimite: row.data_limite,
    emitente: toProfileRef(row.emitente, names),
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
    responsavel: toProfileRef(row.responsavel, names),
    empresaExecutante: row.empresa_executante,
    fiscal: toProfileRef(row.fiscal, names),
    notaSap: row.nota_sap,
    ordemManutencao: row.ordem_manutencao,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    statusSince: null,
  }
}

export async function listAvusForInspection(bucket: FiscalizacaoBucket): Promise<Avu[]> {
  const filter = mapBucketToQuery(bucket)
  let query = supabase.from('avu_fiscalizacao_view').select('*').order('created_at', { ascending: false })

  query = 'status' in filter ? query.eq('status', filter.status) : query.eq('latest_decision', filter.latestDecision)

  const [{ data, error }, profiles] = await Promise.all([query, listProfileOptions()])
  if (error) throw error

  const names = new Map(profiles.map((p) => [p.id, p.fullName]))
  return (data as unknown as RawFiscalizacaoRow[]).map((row) => fromViewRow(row, names))
}

export async function reviewEvidence(avuId: string, decision: ApprovalDecision, comment?: string): Promise<void> {
  const { error } = await supabase.rpc('avu_review_evidence', {
    p_avu_id: avuId,
    p_decision: decision,
    p_comment: comment ?? null,
  })
  if (error) throw error
}

interface RawApprovalRow {
  id: string
  avu_id: string
  fiscal_id: string | null
  decision: ApprovalDecision
  comment: string | null
  created_at: string
  fiscal: { full_name: string } | null
}

export interface AvuApprovalWithFiscal extends AvuApproval {
  fiscalName: string
}

/** Decisões de fiscalização de uma AVU — usado pela linha do tempo completa (`AvuTimeline`). */
export async function listApprovals(avuId: string): Promise<AvuApprovalWithFiscal[]> {
  const { data, error } = await supabase
    .from('avu_approvals')
    .select('id, avu_id, fiscal_id, decision, comment, created_at, fiscal:profiles(full_name)')
    .eq('avu_id', avuId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data as unknown as RawApprovalRow[]).map((row) => ({
    id: row.id,
    avuId: row.avu_id,
    fiscalId: row.fiscal_id,
    decision: row.decision,
    comment: row.comment,
    createdAt: row.created_at,
    fiscalName: row.fiscal?.full_name ?? 'Usuário removido',
  }))
}
