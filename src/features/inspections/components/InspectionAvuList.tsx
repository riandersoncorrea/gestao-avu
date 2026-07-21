import { useNavigate } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { SlaBadge } from '@/features/avus/components/SlaBadge'
import { PriorityBadge } from '@/features/avus/components/PriorityBadge'
import type { Avu } from '@/features/avus/types'
import { ROUTES } from '@/lib/routes'

const COLUMNS: DataTableColumn<Avu>[] = [
  { key: 'numero', header: 'Número AVU', render: (avu) => avu.numeroAvu },
  { key: 'descricao', header: 'Descrição', render: (avu) => <span className="line-clamp-2">{avu.descricao}</span> },
  { key: 'empresa', header: 'Empresa', render: (avu) => avu.empresaExecutante || '—' },
  { key: 'prazo', header: 'Prazo', render: (avu) => <SlaBadge dataLimite={avu.dataLimite} status={avu.status} /> },
  { key: 'prioridade', header: 'Prioridade', render: (avu) => <PriorityBadge prioridade={avu.prioridade} /> },
]

export function InspectionAvuList({ avus, isLoading }: { avus: Avu[]; isLoading?: boolean }) {
  const navigate = useNavigate()

  return (
    <DataTable
      data={avus}
      columns={COLUMNS}
      getRowId={(avu) => avu.id}
      isLoading={isLoading}
      emptyMessage="Nenhuma AVU neste grupo."
      onRowClick={(avu) => navigate(`${ROUTES.inspections}/${avu.id}`)}
    />
  )
}
