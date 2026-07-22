import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Card, CardContent } from '@/components/Card'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { useToast } from '@/components/Toast'
import { listAvus } from '@/features/avus/avuService'
import { AvuFiltersBar } from '@/features/avus/components/AvuFiltersBar'
import { AvuStatusBadge, avuStatusLabel } from '@/features/avus/components/AvuStatusBadge'
import { SlaBadge } from '@/features/avus/components/SlaBadge'
import { EMPTY_AVU_FILTERS, type Avu, type AvuFilters } from '@/features/avus/types'
import { downloadAvusReportExcel } from '@/features/reports/avusReportExcel'
import { downloadAvusReportPdf } from '@/features/reports/avusReportPdf'
import { ROUTES } from '@/lib/routes'
import { formatDate } from '@/utils/format'

/** Rótulo curto dos filtros ativos, pra aparecer no cabeçalho do PDF exportado. */
function summarizeFilters(filters: AvuFilters): string {
  const parts: string[] = []
  if (filters.status) parts.push(`Status: ${avuStatusLabel(filters.status)}`)
  if (filters.categoria) parts.push(`Categoria: ${filters.categoria}`)
  if (filters.local) parts.push(`Local: ${filters.local}`)
  if (filters.gerenciaResponsavel) parts.push(`Gerência: ${filters.gerenciaResponsavel}`)
  if (filters.empresaExecutante) parts.push(`Empresa: ${filters.empresaExecutante}`)
  if (filters.search) parts.push(`Busca: "${filters.search}"`)
  return parts.length > 0 ? parts.join(' · ') : 'Todos os registros'
}

export function ReportsPage() {
  const navigate = useNavigate()
  const { show } = useToast()
  const [filters, setFilters] = useState<AvuFilters>(EMPTY_AVU_FILTERS)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [isExportingExcel, setIsExportingExcel] = useState(false)

  const avusQuery = useQuery({ queryKey: ['avus', 'list', filters], queryFn: () => listAvus(filters) })
  const avus = avusQuery.data ?? []

  async function handleExportPdf() {
    setIsExportingPdf(true)
    try {
      await downloadAvusReportPdf(avus, summarizeFilters(filters))
    } catch (error) {
      show({ tone: 'error', title: 'Falha ao exportar PDF', description: String(error) })
    }
    setIsExportingPdf(false)
  }

  async function handleExportExcel() {
    setIsExportingExcel(true)
    try {
      await downloadAvusReportExcel(avus)
    } catch (error) {
      show({ tone: 'error', title: 'Falha ao exportar Excel', description: String(error) })
    }
    setIsExportingExcel(false)
  }

  const columns: DataTableColumn<Avu>[] = [
    { key: 'numero', header: 'Número', render: (avu) => <span className="font-medium">{avu.numeroAvu}</span> },
    { key: 'status', header: 'Status', render: (avu) => <AvuStatusBadge status={avu.status} /> },
    { key: 'categoria', header: 'Categoria', render: (avu) => avu.categoria ?? '—' },
    { key: 'local', header: 'Local', render: (avu) => avu.local ?? '—' },
    { key: 'responsavel', header: 'Responsável', render: (avu) => avu.responsavel?.fullName ?? '—' },
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
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Relatórios"
        description='Relatório gerencial em lote (PDF/Excel) a partir dos filtros abaixo. Para o laudo de uma AVU específica (com fotos), use o botão "Relatório PDF" no detalhe da AVU.'
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" isLoading={isExportingExcel} onClick={handleExportExcel} disabled={avus.length === 0}>
              <FileSpreadsheet className="size-4" />
              Exportar Excel
            </Button>
            <Button variant="outline" isLoading={isExportingPdf} onClick={handleExportPdf} disabled={avus.length === 0}>
              <FileText className="size-4" />
              Exportar PDF
            </Button>
          </div>
        }
      />

      <AvuFiltersBar filters={filters} onChange={setFilters} />

      <Card>
        <CardContent className="p-0">
          <DataTable
            data={avus}
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
