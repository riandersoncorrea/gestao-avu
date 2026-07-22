import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { LoadingState } from '@/components/LoadingState'
import {
  computeAverageCycleTimeByGroup,
  computeAverageCycleTimeDays,
  computeCriticalAreasRanking,
  computeHeatmapPoints,
  computeKpis,
  computeTemporalSeries,
  groupCount,
} from '@/features/dashboard/analytics'
import { listAvusForDashboard } from '@/features/dashboard/dashboardService'
import { EMPTY_DASHBOARD_FILTERS, type DashboardAvu, type DashboardFilters } from '@/features/dashboard/types'
import { DashboardFiltersBar } from '@/features/dashboard/components/DashboardFiltersBar'
import { DashboardKpis } from '@/features/dashboard/components/DashboardKpis'
import { CycleTimeIndicators } from '@/features/dashboard/components/CycleTimeIndicators'
import { GroupBarChart } from '@/features/dashboard/components/GroupBarChart'
import { CriticalAreasRanking } from '@/features/dashboard/components/CriticalAreasRanking'
import { VulnerabilityHeatmap } from '@/features/dashboard/components/VulnerabilityHeatmap'
import { TemporalChart } from '@/features/dashboard/components/TemporalChart'

export function DashboardPage() {
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_DASHBOARD_FILTERS)

  const avusQuery = useQuery({
    queryKey: ['dashboard', filters],
    queryFn: () => listAvusForDashboard(filters),
  })

  return (
    <div>
      <PageHeader
        title="Dashboard Executivo"
        description="Acompanhamento do desempenho operacional — Serviços Operacionais São Luís EFC."
      />

      <DashboardFiltersBar filters={filters} onChange={setFilters} />

      {avusQuery.isLoading ? (
        <LoadingState />
      ) : (
        <DashboardContent avus={avusQuery.data ?? []} filters={filters} />
      )}
    </div>
  )
}

function DashboardContent({ avus, filters }: { avus: DashboardAvu[]; filters: DashboardFilters }) {
  const kpis = computeKpis(avus)
  const averageCycleTime = computeAverageCycleTimeDays(avus)
  const byGerencia = computeAverageCycleTimeByGroup(avus, (avu) => avu.gerenciaResponsavel)
  const byEmpresa = computeAverageCycleTimeByGroup(avus, (avu) => avu.empresaExecutante)
  const criticalAreas = computeCriticalAreasRanking(avus)
  const temporalSeries = computeTemporalSeries(avus)
  const heatmapPoints = computeHeatmapPoints(avus)

  const byCategoria = groupCount(avus, (avu) => avu.categoria)
  const byLocal = groupCount(avus, (avu) => avu.local)
  const byProjeto = groupCount(avus, (avu) => avu.projeto)
  const byEmitente = groupCount(avus, (avu) => avu.emitente?.fullName ?? null)
  const byResponsavel = groupCount(avus, (avu) => avu.responsavel?.fullName ?? null)

  return (
    <div className="flex flex-col gap-6">
      <DashboardKpis kpis={kpis} dashboardFilters={filters} />

      <CycleTimeIndicators averageDays={averageCycleTime} byGerencia={byGerencia} byEmpresa={byEmpresa} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GroupBarChart title="AVUs por categoria" data={byCategoria} />
        <GroupBarChart title="AVUs por local" data={byLocal} />
        <GroupBarChart title="AVUs por projeto" data={byProjeto} />
        <GroupBarChart title="AVUs por emitente" data={byEmitente} />
        <GroupBarChart title="AVUs por responsável" data={byResponsavel} />
        <CriticalAreasRanking areas={criticalAreas} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <VulnerabilityHeatmap points={heatmapPoints} />
        <TemporalChart data={temporalSeries} />
      </div>
    </div>
  )
}
