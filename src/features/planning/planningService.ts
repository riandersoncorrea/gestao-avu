import { supabase } from '@/lib/supabase'
import { listProfileOptions } from '@/services/profileService'
import type { Avu, AvuPriority, AvuProfileRef, AvuStatus } from '@/features/avus/types'
import type { PlanningFieldsUpdate, PlanningFilters } from './types'

/**
 * Lê de `avu_planning_view` (não de `avus`) para trazer `status_since` sem N+1 queries.
 * Não usamos embed de FK do PostgREST aqui (`profiles!avus_fiscal_fkey(...)`) porque não é
 * garantido que o PostgREST detecte relacionamentos de FK através de uma view — em vez
 * disso resolvemos os nomes de emitente/responsável/fiscal com um mapa de perfis carregado
 * à parte (mesma função já usada pelos seletores do formulário, `listProfileOptions`).
 */
interface RawPlanningRow {
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
  status_since: string
}

function toProfileRef(id: string | null, names: Map<string, string>): AvuProfileRef | null {
  if (!id) return null
  return { id, fullName: names.get(id) ?? 'Usuário removido' }
}

function fromViewRow(row: RawPlanningRow, names: Map<string, string>): Avu {
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
    statusSince: row.status_since,
  }
}

export async function listAvusForPlanning(filters: PlanningFilters): Promise<Avu[]> {
  let query = supabase.from('avu_planning_view').select('*').order('created_at', { ascending: false })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.categoria) query = query.eq('categoria', filters.categoria)
  if (filters.gerenciaResponsavel) query = query.eq('gerencia_responsavel', filters.gerenciaResponsavel)
  if (filters.projeto) query = query.eq('projeto', filters.projeto)
  if (filters.local) query = query.eq('local', filters.local)
  if (filters.empresaExecutante) query = query.eq('empresa_executante', filters.empresaExecutante)
  if (filters.responsavelId) query = query.eq('responsavel', filters.responsavelId)
  if (filters.periodoInicio) query = query.gte('data_criacao', filters.periodoInicio)
  if (filters.periodoFim) query = query.lte('data_criacao', filters.periodoFim)
  if (filters.prioridade) query = query.eq('prioridade', filters.prioridade)

  const term = filters.search.trim().replace(/[,()]/g, '')
  if (term) {
    query = query.or(
      `numero_avu.ilike.%${term}%,descricao.ilike.%${term}%,local.ilike.%${term}%,projeto.ilike.%${term}%`,
    )
  }

  const [{ data, error }, profiles] = await Promise.all([query, listProfileOptions()])
  if (error) throw error

  const names = new Map(profiles.map((p) => [p.id, p.fullName]))
  return (data as unknown as RawPlanningRow[]).map((row) => fromViewRow(row, names))
}

export async function transitionStatus(avuId: string, newStatus: AvuStatus, comment?: string): Promise<void> {
  const { error } = await supabase.rpc('avu_transition_status', {
    p_avu_id: avuId,
    p_new_status: newStatus,
    p_comment: comment ?? null,
  })
  if (error) throw error
}

export async function updatePlanningFields(avuId: string, fields: PlanningFieldsUpdate): Promise<void> {
  const payload: Record<string, unknown> = {}
  if (fields.notaSap !== undefined) payload.nota_sap = fields.notaSap
  if (fields.ordemManutencao !== undefined) payload.ordem_manutencao = fields.ordemManutencao
  if (fields.dataLimite !== undefined) payload.data_limite = fields.dataLimite
  if (fields.prioridade !== undefined) payload.prioridade = fields.prioridade

  const { error } = await supabase.from('avus').update(payload).eq('id', avuId)
  if (error) throw error
}
