import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { LoadingState } from '@/components/LoadingState'
import { Tabs } from '@/components/Tabs'
import { computeSlaStatus } from '@/features/avus/sla'
import { deriveAvuRisk } from '@/features/avus/risk'
import { computeKanbanColumn } from '@/features/planning/kanbanColumn'
import { listAvusForPlanning } from '@/features/planning/planningService'
import { EMPTY_PLANNING_FILTERS, type PlanningFilters } from '@/features/planning/types'
import { PlanningAlerts } from '@/features/planning/components/PlanningAlerts'
import { PlanningFiltersBar } from '@/features/planning/components/PlanningFiltersBar'
import { KanbanBoard } from '@/features/planning/components/KanbanBoard'
import { PlanningTable } from '@/features/planning/components/PlanningTable'

type ViewMode = 'kanban' | 'tabela'

export function PlanningPage() {
  const [filters, setFilters] = useState<PlanningFilters>(EMPTY_PLANNING_FILTERS)
  const [view, setView] = useState<ViewMode>('kanban')

  const avusQuery = useQuery({
    queryKey: ['avus', 'planning', filters],
    queryFn: () => listAvusForPlanning(filters),
  })

  // coluna/risco/prazo são calculados, não colunas do banco — filtrados no cliente.
  const filteredAvus = useMemo(() => {
    const rows = avusQuery.data ?? []
    return rows.filter((avu) => {
      if (filters.coluna && computeKanbanColumn(avu) !== filters.coluna) return false
      if (filters.risco && deriveAvuRisk(avu).level !== filters.risco) return false
      if (filters.slaTone && computeSlaStatus(avu.dataLimite, avu.status).tone !== filters.slaTone) return false
      return true
    })
  }, [avusQuery.data, filters])

  function applyFilterPatch(patch: Partial<PlanningFilters>) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  return (
    <div>
      <PageHeader
        title="Planejamento"
        description="Pipeline operacional das AVUs — de Nota SAP até conclusão, com alertas de prazo."
      />

      <PlanningAlerts avus={avusQuery.data ?? []} onFilterClick={applyFilterPatch} />

      <PlanningFiltersBar filters={filters} onChange={setFilters} />

      <Tabs
        className="mb-4"
        tabs={[
          { key: 'kanban', label: 'Kanban' },
          { key: 'tabela', label: 'Tabela' },
        ]}
        activeKey={view}
        onChange={(key) => setView(key as ViewMode)}
      />

      {avusQuery.isLoading ? (
        <LoadingState />
      ) : view === 'kanban' ? (
        <KanbanBoard avus={filteredAvus} />
      ) : (
        <PlanningTable avus={filteredAvus} />
      )}
    </div>
  )
}
