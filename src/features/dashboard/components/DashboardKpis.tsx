import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileWarning,
  ListChecks,
  Timer,
} from 'lucide-react'
import { KpiCard } from '@/components/KpiCard'
import { ROUTES } from '@/lib/routes'
import type { DashboardKpis as Kpis } from '../analytics'
import type { DashboardBucket, DashboardFilters } from '../types'

const KPI_CONFIG: { label: string; key: keyof Kpis; bucket: DashboardBucket | null; icon: typeof ListChecks }[] = [
  { label: 'Total de AVUs', key: 'total', bucket: null, icon: ListChecks },
  { label: 'Pendentes', key: 'pendentes', bucket: 'pendentes', icon: Clock },
  { label: 'Programados', key: 'programados', bucket: 'programados', icon: CalendarClock },
  { label: 'Em Execução', key: 'emExecucao', bucket: 'em_execucao', icon: Timer },
  { label: 'Concluídos', key: 'concluidos', bucket: 'concluidos', icon: CheckCircle2 },
  { label: 'Sem Planejamento', key: 'semPlanejamento', bucket: 'sem_planejamento', icon: FileWarning },
  { label: 'Vencidos', key: 'vencidos', bucket: 'vencidos', icon: AlertTriangle },
  { label: 'Próximos do Vencimento', key: 'proximosDoVencimento', bucket: 'proximos_vencimento', icon: AlertCircle },
]

export function DashboardKpis({ kpis, dashboardFilters }: { kpis: Kpis; dashboardFilters: DashboardFilters }) {
  const navigate = useNavigate()

  function drillDown(bucket: DashboardBucket | null) {
    navigate(ROUTES.avus, { state: { dashboardFilters, bucket } })
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {KPI_CONFIG.map((config) => (
        <button key={config.key} type="button" onClick={() => drillDown(config.bucket)} className="text-left">
          <KpiCard label={config.label} value={kpis[config.key]} icon={config.icon} className="transition-shadow hover:shadow-md" />
        </button>
      ))}
    </div>
  )
}
