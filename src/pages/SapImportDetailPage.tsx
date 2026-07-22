import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Copy, FileText, RefreshCw, TriangleAlert, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/Card'
import { Button } from '@/components/Button'
import { KpiCard } from '@/components/KpiCard'
import { Tabs } from '@/components/Tabs'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { LoadingState } from '@/components/LoadingState'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { ROUTES } from '@/lib/routes'
import { getImport, listRecords, retryImport } from '@/features/sap/sapImportService'
import { SapImportStatusBadge, SapRecordMatchStatusBadge } from '@/features/sap/components/SapStatusBadges'
import type { SapRecord, SapRecordMatchStatus } from '@/features/sap/types'
import { formatDate, formatDateTime } from '@/utils/format'

type FilterKey = 'todos' | SapRecordMatchStatus

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'RELACIONADO', label: 'Relacionados' },
  { key: 'AVU_NAO_ENCONTRADO', label: 'Não encontrados' },
  { key: 'DUPLICADO', label: 'Duplicados' },
  { key: 'ERRO', label: 'Erros' },
]

export function SapImportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { show } = useToast()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<FilterKey>('todos')
  const [isRetrying, setIsRetrying] = useState(false)

  const importQuery = useQuery({ queryKey: ['sap-imports', id], queryFn: () => getImport(id!), enabled: !!id })
  const recordsQuery = useQuery({
    queryKey: ['sap-imports', id, 'records', filter],
    queryFn: () => listRecords(id!, filter === 'todos' ? undefined : filter),
    enabled: !!id,
  })

  async function handleRetry() {
    if (!id) return
    setIsRetrying(true)
    try {
      const summary = await retryImport(id)
      show({
        tone: 'success',
        title: 'Reprocessado',
        description: `${summary.matched} relacionado(s), ${summary.unmatched} não encontrado(s), ${summary.duplicate} duplicado(s), ${summary.error} erro(s).`,
      })
      queryClient.invalidateQueries({ queryKey: ['sap-imports'] })
    } catch (error) {
      show({ tone: 'error', title: 'Falha ao reprocessar', description: String(error) })
    }
    setIsRetrying(false)
  }

  if (importQuery.isLoading) return <LoadingState />
  if (!importQuery.data) return <EmptyState title="Importação não encontrada" />

  const sapImport = importQuery.data

  const columns: DataTableColumn<SapRecord>[] = [
    { key: 'nota', header: 'Nota', render: (row) => row.nota ?? '—' },
    { key: 'om', header: 'OM', render: (row) => row.om ?? '—' },
    { key: 'descricao', header: 'Descrição', render: (row) => <span className="line-clamp-1 max-w-xs">{row.descricao ?? '—'}</span> },
    { key: 'numeroExtraido', header: 'Nº AVU extraído', render: (row) => row.avuNumeroExtraido ?? '—' },
    {
      key: 'avu',
      header: 'AVU relacionada',
      render: (row) =>
        row.avuId ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              navigate(`${ROUTES.avus}/${row.avuId}`)
            }}
            className="font-medium text-primary-600 hover:underline"
          >
            {row.avuNumeroAvu ?? row.avuId}
          </button>
        ) : (
          '—'
        ),
    },
    { key: 'status', header: 'Status', render: (row) => <SapRecordMatchStatusBadge status={row.matchStatus} /> },
    {
      key: 'detalhe',
      header: 'Detalhe',
      render: (row) =>
        row.matchStatus === 'ERRO' ? (
          <span className="text-xs text-magenta-600">{row.errorMessage}</span>
        ) : row.matchStatus === 'DUPLICADO' ? (
          <span className="text-xs text-gray-500">Nota já processada anteriormente</span>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={sapImport.fileName}
        description={`Importação SAP (${sapImport.fileType.toUpperCase()}) — padrão usado: ${sapImport.regexPattern}`}
        actions={
          <div className="flex items-center gap-3">
            <SapImportStatusBadge status={sapImport.status} />
            <Button variant="outline" size="sm" isLoading={isRetrying} onClick={handleRetry}>
              <RefreshCw className="size-4" />
              Reprocessar
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Processados" value={sapImport.totalRecords} icon={FileText} />
        <KpiCard label="Relacionados" value={sapImport.matchedCount} icon={CheckCircle2} />
        <KpiCard label="Não relacionados" value={sapImport.unmatchedCount} icon={TriangleAlert} />
        <KpiCard label="Duplicados" value={sapImport.duplicateCount} icon={Copy} />
        <KpiCard label="Erros" value={sapImport.errorCount} icon={XCircle} />
      </div>

      <Tabs tabs={FILTER_TABS} activeKey={filter} onChange={(key) => setFilter(key as FilterKey)} />

      <Card>
        <CardContent className="p-0">
          <DataTable
            data={recordsQuery.data ?? []}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={recordsQuery.isLoading}
            emptyMessage="Nenhum registro nesse filtro."
          />
        </CardContent>
      </Card>

      <p className="text-xs text-gray-400">Importado em {formatDateTime(sapImport.createdAt)} · atualizado em {formatDate(sapImport.updatedAt)}</p>
    </div>
  )
}
