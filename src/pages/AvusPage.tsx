import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
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
import { EMPTY_AVU_FILTERS, type Avu } from '@/features/avus/types'
import { ROUTES } from '@/lib/routes'
import { formatDate } from '@/utils/format'

export function AvusPage() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const [filters, setFilters] = useState(EMPTY_AVU_FILTERS)

  const avusQuery = useQuery({ queryKey: ['avus', 'list', filters], queryFn: () => listAvus(filters) })

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
            data={avusQuery.data ?? []}
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
