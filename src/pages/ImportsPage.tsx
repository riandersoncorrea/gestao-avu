import { useState } from 'react'
import type { DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, RefreshCw, Upload } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent } from '@/components/Card'
import { Button } from '@/components/Button'
import { DataTable, type DataTableColumn } from '@/components/DataTable'
import { useToast } from '@/components/Toast'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { listImports, processImport, retryImport, stageImport } from '@/features/imports/importService'
import { AvuImportStatusBadge } from '@/features/imports/components/AvuImportStatusBadge'
import type { AvuImport } from '@/features/imports/types'
import { formatDateTime } from '@/utils/format'

const ACTIVE_STATUSES = new Set(['AGUARDANDO', 'PROCESSANDO'])

export function ImportsPage() {
  const navigate = useNavigate()
  const { show } = useToast()
  const queryClient = useQueryClient()
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const importsQuery = useQuery({
    queryKey: ['avu-imports'],
    queryFn: listImports,
    refetchInterval: (query) => {
      const hasActive = (query.state.data ?? []).some((item) => ACTIVE_STATUSES.has(item.status))
      return hasActive ? 3000 : false
    },
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['avu-imports'] })
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.type === 'application/pdf')
    const rejected = Array.from(fileList).length - files.length
    if (rejected > 0) {
      show({ tone: 'warning', title: 'Alguns arquivos foram ignorados', description: 'Só arquivos PDF são aceitos.' })
    }
    if (files.length === 0) return

    setIsUploading(true)

    // Fase 1 — upload em lote, paralelo: cada arquivo vira uma linha AGUARDANDO na hora.
    const staged = await Promise.all(
      files.map(async (file) => {
        try {
          return await stageImport(file)
        } catch (error) {
          show({ tone: 'error', title: `Falha ao enviar ${file.name}`, description: String(error) })
          return null
        }
      }),
    )
    invalidate()

    // Fase 2 — processamento sequencial: só um PROCESSANDO por vez, o resto espera em AGUARDANDO.
    for (const importId of staged) {
      if (!importId) continue
      await processImport(importId)
      invalidate()
    }

    setIsUploading(false)
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
    if (event.dataTransfer.files.length > 0) void handleFiles(event.dataTransfer.files)
  }

  const columns: DataTableColumn<AvuImport>[] = [
    { key: 'arquivo', header: 'Arquivo', render: (row) => <span className="font-medium">{row.originalFileName}</span> },
    { key: 'status', header: 'Status', render: (row) => <AvuImportStatusBadge status={row.status} /> },
    { key: 'categoria', header: 'Categoria sugerida', render: (row) => row.categoriaSugerida ?? '—' },
    { key: 'confianca', header: 'Confiança', render: (row) => (row.confianca !== null ? `${row.confianca}%` : '—') },
    { key: 'criado', header: 'Criado em', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'acoes',
      header: '',
      render: (row) => (
        <div className="flex justify-end gap-2">
          {row.status === 'ERRO' && (
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
              Tentar novamente
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Importação de AVUs" description="Envie PDFs no modelo padronizado para criação automática de AVUs." />

      <Card>
        <CardContent>
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
              <p className="text-sm font-medium text-graphite-700">Arraste PDFs aqui, ou selecione manualmente</p>
              <p className="mt-1 text-xs text-gray-500">Upload individual ou em lote — só arquivos PDF.</p>
            </div>

            <input
              id="import-files"
              type="file"
              multiple
              accept="application/pdf"
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
              onClick={() => document.getElementById('import-files')?.click()}
            >
              <Upload className="size-4" />
              Selecionar PDFs
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
            emptyMessage="Nenhuma importação ainda — envie um PDF para começar."
            onRowClick={(row) => navigate(`${ROUTES.imports}/${row.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  )
}
