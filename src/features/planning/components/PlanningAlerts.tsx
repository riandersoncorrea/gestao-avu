import { AlertTriangle, CalendarClock, ClipboardList, FileWarning, Receipt } from 'lucide-react'
import { KpiCard } from '@/components/KpiCard'
import { computeSlaStatus } from '@/features/avus/sla'
import type { Avu, AvuStatus } from '@/features/avus/types'
import { computeKanbanColumn } from '../kanbanColumn'
import type { PlanningFilters } from '../types'

const TERMINAL_STATUSES: AvuStatus[] = ['CONCLUIDO', 'REPROVADO', 'CANCELADO']

export interface PlanningAlertsProps {
  avus: Avu[]
  onFilterClick: (patch: Partial<PlanningFilters>) => void
}

export function PlanningAlerts({ avus, onFilterClick }: PlanningAlertsProps) {
  const semNota = avus.filter((a) => !a.notaSap && !TERMINAL_STATUSES.includes(a.status)).length
  const semOm = avus.filter((a) => a.notaSap && !a.ordemManutencao && !TERMINAL_STATUSES.includes(a.status)).length
  const semPlanejamento = avus.filter((a) => computeKanbanColumn(a) === 'OM_SEM_PLANEJAMENTO').length
  const vencidas = avus.filter((a) => computeSlaStatus(a.dataLimite, a.status).tone === 'vencido').length
  const proximas = avus.filter((a) => computeSlaStatus(a.dataLimite, a.status).tone === 'proximo_vencimento').length

  return (
    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <button type="button" className="text-left" onClick={() => onFilterClick({ coluna: 'SEM_NOTA' })}>
        <KpiCard label="AVUs sem Nota" value={semNota} icon={FileWarning} />
      </button>
      <button type="button" className="text-left" onClick={() => onFilterClick({ coluna: 'NOTA_CRIADA' })}>
        <KpiCard label="AVUs sem OM" value={semOm} icon={Receipt} />
      </button>
      <button
        type="button"
        className="text-left"
        onClick={() => onFilterClick({ coluna: 'OM_SEM_PLANEJAMENTO' })}
      >
        <KpiCard label="AVUs sem planejamento" value={semPlanejamento} icon={ClipboardList} />
      </button>
      <button type="button" className="text-left" onClick={() => onFilterClick({ coluna: 'VENCIDO' })}>
        <KpiCard label="AVUs vencidas" value={vencidas} icon={AlertTriangle} />
      </button>
      <button type="button" className="text-left" onClick={() => onFilterClick({ slaTone: 'proximo_vencimento' })}>
        <KpiCard label="Próximas do vencimento" value={proximas} icon={CalendarClock} />
      </button>
    </div>
  )
}
