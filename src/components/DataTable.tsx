import { type ReactNode, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/Table'
import { EmptyState } from '@/components/EmptyState'
import { LoadingState } from '@/components/LoadingState'
import { cn } from '@/lib/utils'

export interface DataTableColumn<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  className?: string
}

export interface DataTableProps<T> {
  data: T[]
  columns: DataTableColumn<T>[]
  getRowId: (row: T) => string
  isLoading?: boolean
  emptyMessage?: string
  pageSize?: number
  onRowClick?: (row: T) => void
  /** Classe extra por linha (ex.: realçar a linha selecionada) — opcional, não afeta usos existentes. */
  getRowClassName?: (row: T) => string | undefined
}

export function DataTable<T>({
  data,
  columns,
  getRowId,
  isLoading,
  emptyMessage = 'Nenhum registro encontrado.',
  pageSize = 10,
  onRowClick,
  getRowClassName,
}: DataTableProps<T>) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(data.length / pageSize))
  const pageData = useMemo(
    () => data.slice((page - 1) * pageSize, page * pageSize),
    [data, page, pageSize],
  )

  if (isLoading) return <LoadingState />
  if (data.length === 0) return <EmptyState title={emptyMessage} />

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableHeaderCell key={column.key} className={column.className}>
                {column.header}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {pageData.map((row) => (
            <TableRow
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(onRowClick && 'cursor-pointer', getRowClassName?.(row))}
            >
              {columns.map((column) => (
                <TableCell key={column.key} className={column.className}>
                  {column.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Página {page} de {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-lg border border-gray-300',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
              aria-label="Página anterior"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page === pageCount}
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-lg border border-gray-300',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
              aria-label="Próxima página"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
