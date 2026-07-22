import type { AvuStatus } from './types'

export type SlaTone = 'no_prazo' | 'proximo_vencimento' | 'vencido' | 'encerrado'

export interface SlaInfo {
  tone: SlaTone
  label: string
  daysUntilDue: number | null
  daysOverdue: number
}

const MS_PER_DAY = 1000 * 60 * 60 * 24
/** Também replicado em SQL puro por `avu_generate_deadline_notifications` (migration 0010) — mantenha os dois em sincronia. */
export const WARNING_THRESHOLD_DAYS = 3
const TERMINAL_STATUSES: AvuStatus[] = ['CONCLUIDO', 'REPROVADO', 'CANCELADO']

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Dias entre hoje e a data limite (negativo = já passou). Null se não houver prazo. */
export function daysUntilDue(dataLimite: string | null, referenceDate: Date = new Date()): number | null {
  if (!dataLimite) return null
  const due = startOfDay(new Date(`${dataLimite}T00:00:00`))
  const ref = startOfDay(referenceDate)
  return Math.round((due.getTime() - ref.getTime()) / MS_PER_DAY)
}

/** Dias em atraso (0 se não está atrasada ou não tem prazo). */
export function daysOverdue(dataLimite: string | null, referenceDate: Date = new Date()): number {
  const diff = daysUntilDue(dataLimite, referenceDate)
  return diff !== null && diff < 0 ? Math.abs(diff) : 0
}

/**
 * Indicador de SLA para a UI (badge da listagem/detalhe). Status terminais (concluído,
 * reprovado, cancelado) sempre voltam "encerrado" — o prazo deixa de fazer sentido.
 */
export function computeSlaStatus(
  dataLimite: string | null,
  status: AvuStatus,
  referenceDate: Date = new Date(),
): SlaInfo {
  if (TERMINAL_STATUSES.includes(status)) {
    return { tone: 'encerrado', label: 'Encerrado', daysUntilDue: null, daysOverdue: 0 }
  }

  const diff = daysUntilDue(dataLimite, referenceDate)

  if (diff === null) {
    return { tone: 'no_prazo', label: 'Sem prazo definido', daysUntilDue: null, daysOverdue: 0 }
  }

  if (diff < 0) {
    return {
      tone: 'vencido',
      label: `Vencido há ${Math.abs(diff)} dia(s)`,
      daysUntilDue: diff,
      daysOverdue: Math.abs(diff),
    }
  }

  if (diff <= WARNING_THRESHOLD_DAYS) {
    return {
      tone: 'proximo_vencimento',
      label: diff === 0 ? 'Vence hoje' : `Vence em ${diff} dia(s)`,
      daysUntilDue: diff,
      daysOverdue: 0,
    }
  }

  return {
    tone: 'no_prazo',
    label: `${diff} dia(s) até o prazo`,
    daysUntilDue: diff,
    daysOverdue: 0,
  }
}
