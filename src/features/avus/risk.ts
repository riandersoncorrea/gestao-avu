import { computeSlaStatus, type SlaTone } from './sla'
import type { Avu, AvuPriority, AvuStatus } from './types'

export type RiskLevel = 'baixo' | 'medio' | 'alto' | 'critico'

const TERMINAL_STATUSES: AvuStatus[] = ['CONCLUIDO', 'REPROVADO', 'CANCELADO']

const RISK_LABELS: Record<RiskLevel, string> = {
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
  critico: 'Crítico',
}

export interface RiskInput {
  slaTone: SlaTone
  prioridade: AvuPriority
  status: AvuStatus
  /** Dias desde a última transição de status (ver Avu.statusSince). */
  daysInCurrentStatus: number
}

export interface RiskInfo {
  level: RiskLevel
  label: string
  score: number
}

/**
 * Indicador de risco — combina SLA, prioridade, status e tempo parado no status atual.
 * Fórmula documentada em docs/database.md (ajustável, não é uma regra de negócio fixa
 * do usuário): SLA (vencido=3, próximo=2) + prioridade (crítica=2, alta=1) +
 * tempo parado (>30 dias=2, >14 dias=1) → soma vira nível.
 */
export function computeRiskLevel(input: RiskInput): RiskInfo {
  if (TERMINAL_STATUSES.includes(input.status)) {
    return { level: 'baixo', label: RISK_LABELS.baixo, score: 0 }
  }

  let score = 0

  if (input.slaTone === 'vencido') score += 3
  else if (input.slaTone === 'proximo_vencimento') score += 2

  if (input.prioridade === 'CRITICA') score += 2
  else if (input.prioridade === 'ALTA') score += 1

  if (input.daysInCurrentStatus > 30) score += 2
  else if (input.daysInCurrentStatus > 14) score += 1

  let level: RiskLevel
  if (score >= 6) level = 'critico'
  else if (score >= 4) level = 'alto'
  else if (score >= 2) level = 'medio'
  else level = 'baixo'

  return { level, label: RISK_LABELS[level], score }
}

/** Dias inteiros desde `dateIso` até `referenceDate` (>= 0). */
export function daysSince(dateIso: string, referenceDate: Date = new Date()): number {
  const start = new Date(dateIso)
  const diffMs = referenceDate.getTime() - start.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

/** Conveniência: monta o RiskInput a partir de uma Avu (statusSince precisa vir de avu_planning_view). */
export function deriveAvuRisk(
  avu: Pick<Avu, 'dataLimite' | 'status' | 'prioridade' | 'statusSince'>,
  referenceDate: Date = new Date(),
): RiskInfo {
  const sla = computeSlaStatus(avu.dataLimite, avu.status, referenceDate)
  const daysInCurrentStatus = avu.statusSince ? daysSince(avu.statusSince, referenceDate) : 0

  return computeRiskLevel({
    slaTone: sla.tone,
    prioridade: avu.prioridade,
    status: avu.status,
    daysInCurrentStatus,
  })
}
