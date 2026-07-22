import { supabase } from '@/lib/supabase'
import { listProfileOptions } from '@/services/profileService'
import type { AvuPriority, AvuProfileRef, AvuStatus } from '@/features/avus/types'
import type { DashboardAvu, DashboardFilters } from './types'

/** Mesma estratégia de `planningService.listAvusForPlanning`: lê de uma view
 * (`avu_dashboard_view`) e resolve emitente/responsável/fiscal via mapa de perfis
 * carregado à parte, já que embeds de FK do PostgREST não são garantidos através
 * de views. */
interface RawDashboardRow {
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
  data_conclusao: string | null
}

function toProfileRef(id: string | null, names: Map<string, string>): AvuProfileRef | null {
  if (!id) return null
  return { id, fullName: names.get(id) ?? 'Usuário removido' }
}

function fromViewRow(row: RawDashboardRow, names: Map<string, string>): DashboardAvu {
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
    dataConclusao: row.data_conclusao,
  }
}

export async function listAvusForDashboard(filters: DashboardFilters): Promise<DashboardAvu[]> {
  let query = supabase.from('avu_dashboard_view').select('*').order('created_at', { ascending: false })

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.categoria) query = query.eq('categoria', filters.categoria)
  if (filters.gerenciaResponsavel) query = query.eq('gerencia_responsavel', filters.gerenciaResponsavel)
  if (filters.projeto) query = query.eq('projeto', filters.projeto)
  if (filters.local) query = query.eq('local', filters.local)
  if (filters.empresaExecutante) query = query.eq('empresa_executante', filters.empresaExecutante)
  if (filters.responsavelId) query = query.eq('responsavel', filters.responsavelId)
  if (filters.emitenteId) query = query.eq('emitente', filters.emitenteId)
  if (filters.periodoInicio) query = query.gte('data_criacao', filters.periodoInicio)
  if (filters.periodoFim) query = query.lte('data_criacao', filters.periodoFim)

  const [{ data, error }, profiles] = await Promise.all([query, listProfileOptions()])
  if (error) throw error

  const names = new Map(profiles.map((p) => [p.id, p.fullName]))
  return (data as unknown as RawDashboardRow[]).map((row) => fromViewRow(row, names))
}
