import { useState } from 'react'
import type { DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, RefreshCw, Upload } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/Card'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { useToast } from '@/components/Toast'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { listImports, processImport, retryImport, startImport } from '@/features/sap/sapImportService'
import { parseSapCsv } from '@/features/sap/parsers/csv'
import { parseSapXlsx } from '@/features/sap/parsers/xlsx'
import { DEFAULT_AVU_REGEX_PATTERN, extractAvuNumero } from '@/features/sap/extractAvuNumero'
import { SapImportStatusBadge } from '@/features/sap/components/SapStatusBadges'
import type { SapImport } from '@/features/sap/types'
import { formatDateTime } from '@/utils/format'

function fileType(file: File): 'csv' | 'xlsx' | null {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) return 'csv'
  if (name.endsWith('.xlsx')) return 'xlsx'
  return null
}

export function SapImportPage() {
  const navigate = useNavigate()
  const { show } = useToast()
  const queryClient = useQueryClient()
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [regexPattern, setRegexPattern] = useState(DEFAULT_AVU_REGEX_PATTERN)

  const importsQuery = useQuery({ queryKey: ['sap-imports'], queryFn: listImports })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['sap-imports'] })
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    const valid = files.filter((file) => fileType(file) !== null)
    if (valid.length < files.length) {
      show({ tone: 'warning', title: 'Alguns arquivos foram ignorados', description: 'Só arquivos CSV ou XLSX são aceitos.' })
    }
    if (valid.length === 0) return

    setIsUploading(true)

    for (const file of valid) {
      const type = fileType(file)!
      try {
        const rows = type === 'csv' ? await parseSapCsv(file) : await parseSapXlsx(file)
        const records = rows.map((row) => ({ ...row, avuNumeroExtraido: extractAvuNumero(row.descricao, regexPattern) }))

        const importId = crypto.randomUUID()
        await startImport(importId, file.name, type, regexPattern)
        const summary = await processImport(importId, records)

        show({
          tone: 'success',
          title: `${file.name} processado`,
          description: `${summary.matched} relacionado(s), ${summary.unmatched} não encontrado(s), ${summary.duplicate} duplicado(s), ${summary.error} erro(s).`,
        })
      } catch (error) {
        show({ tone: 'error', title: `Falha ao processar ${file.name}`, description: String(error) })
      }
      invalidate()
    }

    setIsUploading(false)
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    if (event.dataTransfer.files.length > 0) void handleFiles(event.dataTransfer.files)
  }

  const columns: DataTableColumn<SapImport>[] = [
    { key: 'arquivo', header: 'Arquivo', render: (row) => <span className="font-medium">{row.fileName}</span> },
    { key: 'tipo', header: 'Tipo', render: (row) => row.fileType.toUpperCase() },
    { key: 'status', header: 'Status', render: (row) => <SapImportStatusBadge status={row.status} /> },
    { key: 'total', header: 'Total', render: (row) => row.totalRecords },
    { key: 'relacionados', header: 'Relacionados', render: (row) => row.matchedCount },
    { key: 'naoEncontrados', header: 'Não encontrados', render: (row) => row.unmatchedCount },
    { key: 'duplicados', header: 'Duplicados', render: (row) => row.duplicateCount },
    { key: 'erros', header: 'Erros', render: (row) => row.errorCount },
    { key: 'criado', header: 'Criado em', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'acoes',
      header: '',
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation()
              retryImport(row.id)
                .then(invalidate)
                .catch((error) => show({ tone: 'error', title: 'Falha ao reprocessar', description: String(error) }))
            }}
          >
            <RefreshCw className="size-3.5" />
            Reprocessar
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Importação SAP" description="Importe arquivos exportados do SAP (CSV/XLSX) para relacionar e atualizar AVUs." />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Input
            label="Padrão do número da AVU na descrição (regex)"
            hint='Ex.: "AVU2026004155 - Recuperação de Cerca" — ajuste se o formato do seu SAP for diferente.'
            value={regexPattern}
            onChange={(event) => setRegexPattern(event.target.value)}
          />

          <div
            onDragOver={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
              isDragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300',
            )}
          >
            <div className="rounded-full bg-primary-50 p-3 text-primary-600">
              <FileUp className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-graphite-700">Arraste arquivos aqui, ou selecione manualmente</p>
              <p className="mt-1 text-xs text-gray-500">Upload individual ou em lote — CSV ou XLSX.</p>
            </div>

            <input
              id="sap-import-files"
              type="file"
              multiple
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void handleFiles(event.target.files)
                event.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              isLoading={isUploading}
              onClick={() => document.getElementById('sap-import-files')?.click()}
            >
              <Upload className="size-4" />
              Selecionar arquivos
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <DataTable
            data={importsQuery.data ?? []}
            columns={columns}
            getRowId={(row) => row.id}
            isLoading={importsQuery.isLoading}
            emptyMessage="Nenhuma importação ainda — envie um arquivo do SAP para começar."
            onRowClick={(row) => navigate(`${ROUTES.sapImports}/${row.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
