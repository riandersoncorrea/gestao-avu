import { useNavigate } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { SlaBadge } from '@/features/avus/components/SlaBadge'
import { PriorityBadge } from '@/features/avus/components/PriorityBadge'
import type { Avu } from '@/features/avus/types'
import { formatDate } from '@/utils/format'
import { ROUTES } from '@/lib/routes'

const COLUMNS: DataTableColumn<Avu>[] = [
  { key: 'numero', header: 'Número AVU', render: (avu) => avu.numeroAvu },
  { key: 'descricao', header: 'Descrição', render: (avu) => <span className="line-clamp-2">{avu.descricao}</span> },
  { key: 'local', header: 'Local', render: (avu) => avu.local || '—' },
  { key: 'categoria', header: 'Categoria', render: (avu) => avu.categoria || '—' },
  {
    key: 'prazo',
    header: 'Prazo',
    render: (avu) => (
      <div className="flex flex-col gap-1">
        <span>{avu.dataLimite ? formatDate(avu.dataLimite) : '—'}</span>
        <SlaBadge dataLimite={avu.dataLimite} status={avu.status} />
      </div>
    ),
  },
  { key: 'prioridade', header: 'Prioridade', render: (avu) => <PriorityBadge prioridade={avu.prioridade} /> },
  { key: 'nota', header: 'Nota', render: (avu) => avu.notaSap || '—' },
  { key: 'om', header: 'OM', render: (avu) => avu.ordemManutencao || '—' },
]

export function PortalAvuList({ avus, isLoading }: { avus: Avu[]; isLoading?: boolean }) {
  const navigate = useNavigate()

  return (
    <DataTable
      data={avus}
      columns={COLUMNS}
      getRowId={(avu) => avu.id}
      isLoading={isLoading}
      emptyMessage="Nenhuma AVU atribuída à sua empresa ainda."
      onRowClick={(avu) => navigate(`${ROUTES.portal}/avus/${avu.id}`)}
    />
  )
}
