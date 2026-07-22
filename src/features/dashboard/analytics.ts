import { computeSlaStatus } from '@/features/avus/sla'
import { deriveAvuRisk } from '@/features/avus/risk'
import type { Avu, AvuStatus } from '@/features/avus/types'
import type { DashboardAvu, DashboardBucket } from './types'

const PENDENTES_STATUSES: AvuStatus[] = ['NOVO', 'TRIAGEM', 'PLANEJAMENTO']
const TERMINAL_STATUSES: AvuStatus[] = ['CONCLUIDO', 'CANCELADO', 'REPROVADO']

/** Fonte única de verdade dos 7 buckets do dashboard (Total não é um bucket — é o array
 * inteiro). Usada tanto para contar os KPIs quanto para filtrar no drill-down (`/avus` —
 * por isso recebe `Avu` simples, não `DashboardAvu`: nenhum bucket depende de `dataConclusao`). */
export function avuMatchesBucket(avu: Avu, bucket: DashboardBucket, referenceDate: Date = new Date()): boolean {
  switch (bucket) {
    case 'pendentes':
      return PENDENTES_STATUSES.includes(avu.status)
    case 'programados':
      return avu.status === 'PROGRAMADO'
    case 'em_execucao':
      return avu.status === 'EM_EXECUCAO'
    case 'concluidos':
      return avu.status === 'CONCLUIDO'
    case 'sem_planejamento':
      return !TERMINAL_STATUSES.includes(avu.status) && (!avu.notaSap || !avu.ordemManutencao)
    case 'vencidos':
      return computeSlaStatus(avu.dataLimite, avu.status, referenceDate).tone === 'vencido'
    case 'proximos_vencimento':
      return computeSlaStatus(avu.dataLimite, avu.status, referenceDate).tone === 'proximo_vencimento'
  }
}

export interface DashboardKpis {
  total: number
  pendentes: number
  programados: number
  emExecucao: number
  concluidos: number
  semPlanejamento: number
  vencidos: number
  proximosDoVencimento: number
}

export function computeKpis(avus: DashboardAvu[], referenceDate: Date = new Date()): DashboardKpis {
  const kpis: DashboardKpis = {
    total: avus.length,
    pendentes: 0,
    programados: 0,
    emExecucao: 0,
    concluidos: 0,
    semPlanejamento: 0,
    vencidos: 0,
    proximosDoVencimento: 0,
  }

  for (const avu of avus) {
    if (avuMatchesBucket(avu, 'pendentes', referenceDate)) kpis.pendentes++
    if (avuMatchesBucket(avu, 'programados', referenceDate)) kpis.programados++
    if (avuMatchesBucket(avu, 'em_execucao', referenceDate)) kpis.emExecucao++
    if (avuMatchesBucket(avu, 'concluidos', referenceDate)) kpis.concluidos++
    if (avuMatchesBucket(avu, 'sem_planejamento', referenceDate)) kpis.semPlanejamento++
    if (avuMatchesBucket(avu, 'vencidos', referenceDate)) kpis.vencidos++
    if (avuMatchesBucket(avu, 'proximos_vencimento', referenceDate)) kpis.proximosDoVencimento++
  }

  return kpis
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

function cycleTimeDays(avu: DashboardAvu): number | null {
  if (!avu.dataConclusao) return null
  // dataCriacao é uma data pura (sem fuso) e dataConclusao vem de um timestamptz do
  // Postgres (com offset/Z) — ancorar as duas em UTC evita um desvio de horas conforme
  // o fuso local de quem executa o código.
  const start = new Date(`${avu.dataCriacao}T00:00:00Z`)
  const end = new Date(avu.dataConclusao)
  return Math.max(0, (end.getTime() - start.getTime()) / MS_PER_DAY)
}

/** Tempo médio de atendimento (dias), só considerando AVUs concluídas. Null se nenhuma concluída. */
export function computeAverageCycleTimeDays(avus: DashboardAvu[]): number | null {
  const durations = avus.map(cycleTimeDays).filter((d): d is number => d !== null)
  if (durations.length === 0) return null
  return durations.reduce((sum, d) => sum + d, 0) / durations.length
}

export interface GroupCycleTime {
  key: string
  avgDays: number
  count: number
}

/** Tempo médio de atendimento agrupado (por gerência ou por empresa executante),
 * ordenado do maior tempo médio pro menor. */
export function computeAverageCycleTimeByGroup(
  avus: DashboardAvu[],
  keyFn: (avu: DashboardAvu) => string | null,
): GroupCycleTime[] {
  const byKey = new Map<string, number[]>()

  for (const avu of avus) {
    const duration = cycleTimeDays(avu)
    if (duration === null) continue
    const key = keyFn(avu)
    if (!key) continue
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(duration)
  }

  return [...byKey.entries()]
    .map(([key, durations]) => ({
      key,
      avgDays: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      count: durations.length,
    }))
    .sort((a, b) => b.avgDays - a.avgDays)
}

export interface GroupedCount {
  key: string
  count: number
}

/** Contagem por dimensão (categoria/local/projeto/emitente/responsável), ordenada desc,
 * cortada em topN — evita gráfico ilegível quando a dimensão tem muitos valores distintos. */
export function groupCount(
  avus: DashboardAvu[],
  keyFn: (avu: DashboardAvu) => string | null,
  topN = 10,
): GroupedCount[] {
  const counts = new Map<string, number>()

  for (const avu of avus) {
    const key = keyFn(avu)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
}

export interface CriticalArea {
  area: string
  criticalCount: number
  total: number
}

/** Ranking de áreas críticas: agrupa por gerência responsável, conta quantas AVUs têm
 * risco alto/crítico (deriveAvuRisk, features/avus/risk.ts), ordenado desc. Top 10. */
export function computeCriticalAreasRanking(
  avus: DashboardAvu[],
  referenceDate: Date = new Date(),
  topN = 10,
): CriticalArea[] {
  const byArea = new Map<string, { criticalCount: number; total: number }>()

  for (const avu of avus) {
    const area = avu.gerenciaResponsavel
    if (!area) continue
    if (!byArea.has(area)) byArea.set(area, { criticalCount: 0, total: 0 })
    const entry = byArea.get(area)!
    entry.total++
    const risk = deriveAvuRisk(avu, referenceDate)
    if (risk.level === 'alto' || risk.level === 'critico') entry.criticalCount++
  }

  return [...byArea.entries()]
    .map(([area, { criticalCount, total }]) => ({ area, criticalCount, total }))
    .sort((a, b) => b.criticalCount - a.criticalCount)
    .slice(0, topN)
}

export interface TemporalPoint {
  month: string
  count: number
}

/** Série temporal — AVUs criadas por mês, últimos N meses (default 12), ordenado cronologicamente. */
export function computeTemporalSeries(
  avus: DashboardAvu[],
  months = 12,
  referenceDate: Date = new Date(),
): TemporalPoint[] {
  const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' })
  const buckets: { key: string; label: string; count: number }[] = []

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    buckets.push({ key, label: formatter.format(date), count: 0 })
  }

  const byKey = new Map(buckets.map((b) => [b.key, b]))

  for (const avu of avus) {
    const created = new Date(`${avu.dataCriacao}T00:00:00`)
    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
    const bucket = byKey.get(key)
    if (bucket) bucket.count++
  }

  return buckets.map((b) => ({ month: b.label, count: b.count }))
}

export interface HeatmapPoint {
  longitude: number
  latitude: number
}

/** Pontos para o mapa de calor — só as AVUs do conjunto filtrado que têm coordenadas. */
export function computeHeatmapPoints(avus: DashboardAvu[]): HeatmapPoint[] {
  return avus
    .filter((avu) => avu.latitude !== null && avu.longitude !== null)
    .map((avu) => ({ longitude: avu.longitude!, latitude: avu.latitude! }))
}
