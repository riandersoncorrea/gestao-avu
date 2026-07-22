import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Card, CardContent } from '@/components/Card'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { useAuth } from '@/features/auth/AuthContext'
import { listAvus } from '@/features/avus/avuService'
import { AvuFiltersBar } from '@/features/avus/components/AvuFiltersBar'
import { AvuStatusBadge } from '@/features/avus/components/AvuStatusBadge'
import { SlaBadge } from '@/features/avus/components/SlaBadge'
import { EMPTY_AVU_FILTERS, type Avu, type AvuFilters } from '@/features/avus/types'
import { avuMatchesBucket } from '@/features/dashboard/analytics'
import type { DashboardBucket, DashboardFilters } from '@/features/dashboard/types'
import { ROUTES } from '@/lib/routes'
import { formatDate } from '@/utils/format'

/** Drill-down vindo dos KPIs do Dashboard Executivo (`navigate(ROUTES.avus, { state })`). */
interface DrillDownState {
  dashboardFilters?: DashboardFilters
  bucket?: DashboardBucket | null
}

/** `DashboardFilters` não tem `search`, e `emitenteId` não tem equivalente em `AvuFilters`
 * (a barra de filtros de `/avus` não oferece esse campo) — o resto mapeia direto. */
function toAvuFilters(dashboardFilters: DashboardFilters): AvuFilters {
  return {
    ...EMPTY_AVU_FILTERS,
    status: dashboardFilters.status,
    categoria: dashboardFilters.categoria,
    gerenciaResponsavel: dashboardFilters.gerenciaResponsavel,
    projeto: dashboardFilters.projeto,
    local: dashboardFilters.local,
    empresaExecutante: dashboardFilters.empresaExecutante,
    responsavelId: dashboardFilters.responsavelId,
    periodoInicio: dashboardFilters.periodoInicio,
    periodoFim: dashboardFilters.periodoFim,
  }
}

export function AvusPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { hasPermission } = useAuth()
  const drillDown = location.state as DrillDownState | null
  const [filters, setFilters] = useState<AvuFilters>(() =>
    drillDown?.dashboardFilters ? toAvuFilters(drillDown.dashboardFilters) : EMPTY_AVU_FILTERS,
  )

  const avusQuery = useQuery({ queryKey: ['avus', 'list', filters], queryFn: () => listAvus(filters) })
  const bucket = drillDown?.bucket
  const tableData = bucket ? (avusQuery.data ?? []).filter((avu) => avuMatchesBucket(avu, bucket)) : avusQuery.data ?? []

  const columns: DataTableColumn<Avu>[] = [
    { key: 'numero', header: 'Número', render: (avu) => <span className="font-medium">{avu.numeroAvu}</span> },
    {
      key: 'descricao',
      header: 'Descrição',
      render: (avu) => <span className="line-clamp-2 max-w-xs">{avu.descricao}</span>,
    },
    { key: 'categoria', header: 'Categoria', render: (avu) => avu.categoria ?? '—' },
    { key: 'local', header: 'Local', render: (avu) => avu.local ?? '—' },
    { key: 'gerencia', header: 'Gerência', render: (avu) => avu.gerenciaResponsavel ?? '—' },
    { key: 'status', header: 'Status', render: (avu) => <AvuStatusBadge status={avu.status} /> },
    {
      key: 'prazo',
      header: 'Prazo',
      render: (avu) => (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">{avu.dataLimite ? formatDate(avu.dataLimite) : '—'}</span>
          <SlaBadge dataLimite={avu.dataLimite} status={avu.status} />
        </div>
      ),
    },
    { key: 'responsavel', header: 'Responsável', render: (avu) => avu.responsavel?.fullName ?? '—' },
    { key: 'nota', header: 'Nota', render: (avu) => avu.notaSap ?? '—' },
    { key: 'om', header: 'OM', render: (avu) => avu.ordemManutencao ?? '—' },
  ]

  return (
    <div>
      <PageHeader
        title="AVUs"
        description="Análises de Vulnerabilidades — identificação, execução e encerramento."
        actions={
          hasPermission('avus.create') && (
            <Button onClick={() => navigate(ROUTES.avus + '/novo')}>
              <Plus className="size-4" />
              Nova AVU
            </Button>
          )
        }
      />

      <AvuFiltersBar filters={filters} onChange={setFilters} />

      <Card>
        <CardContent className="p-0">
          <DataTable
            data={tableData}
            columns={columns}
            getRowId={(avu) => avu.id}
            isLoading={avusQuery.isLoading}
            emptyMessage="Nenhuma AVU encontrada com os filtros atuais."
            onRowClick={(avu) => navigate(`${ROUTES.avus}/${avu.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
