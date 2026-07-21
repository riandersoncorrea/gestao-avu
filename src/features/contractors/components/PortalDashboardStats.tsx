import { AlertTriangle, CheckCircle2, Clock, FileWarning, ListChecks, Timer } from 'lucide-react'
import { KpiCard } from '@/components/KpiCard'
import type { PortalDashboardStats as Stats } from '../types'

export function PortalDashboardStats({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard label="Total de AVUs" value={stats.total} icon={ListChecks} />
      <KpiCard label="Pendentes" value={stats.pendentes} icon={Clock} />
      <KpiCard label="Em execução" value={stats.emExecucao} icon={Timer} />
      <KpiCard label="Aguardando evidências" value={stats.aguardandoEvidencias} icon={FileWarning} />
      <KpiCard label="Concluídos" value={stats.concluidos} icon={CheckCircle2} />
      <KpiCard label="Vencidos" value={stats.vencidos} icon={AlertTriangle} />
    </div>
  )
}
