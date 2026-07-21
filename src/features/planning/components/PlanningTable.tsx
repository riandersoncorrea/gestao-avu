import { useNavigate } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { AvuStatusBadge } from '@/features/avus/components/AvuStatusBadge'
import { SlaBadge } from '@/features/avus/components/SlaBadge'
import { PriorityBadge } from '@/features/avus/components/PriorityBadge'
import { RiskBadge } from '@/features/avus/components/RiskBadge'
import { daysSince } from '@/features/avus/risk'
import type { Avu } from '@/features/avus/types'
import { ROUTES } from '@/lib/routes'
import { formatDate } from '@/utils/format'

export function PlanningTable({ avus, isLoading }: { avus: Avu[]; isLoading?: boolean }) {
  const navigate = useNavigate()

  const columns: DataTableColumn<Avu>[] = [
    { key: 'numero', header: 'Número', render: (avu) => <span className="font-medium">{avu.numeroAvu}</span> },
    {
      key: 'descricao',
      header: 'Descrição',
      render: (avu) => <span className="line-clamp-2 max-w-xs">{avu.descricao}</span>,
    },
    { key: 'status', header: 'Status', render: (avu) => <AvuStatusBadge status={avu.status} /> },
    { key: 'prioridade', header: 'Prioridade', render: (avu) => <PriorityBadge prioridade={avu.prioridade} /> },
    { key: 'risco', header: 'Risco', render: (avu) => <RiskBadge avu={avu} /> },
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
    {
      key: 'paradoHa',
      header: 'Parado há',
      render: (avu) => (avu.statusSince ? `${daysSince(avu.statusSince)} dia(s)` : '—'),
    },
    { key: 'gerencia', header: 'Gerência', render: (avu) => avu.gerenciaResponsavel ?? '—' },
    { key: 'responsavel', header: 'Responsável', render: (avu) => avu.responsavel?.fullName ?? '—' },
  ]

  return (
    <DataTable
      data={avus}
      columns={columns}
      getRowId={(avu) => avu.id}
      isLoading={isLoading}
      emptyMessage="Nenhuma AVU encontrada com os filtros atuais."
      onRowClick={(avu) => navigate(`${ROUTES.avus}/${avu.id}`)}
    />
  )
}
