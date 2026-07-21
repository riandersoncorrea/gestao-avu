import type { Avu } from '@/features/avus/types'
import { computeKanbanColumn, KANBAN_COLUMNS, KANBAN_COLUMN_LABELS, type KanbanColumnKey } from '../kanbanColumn'
import { KanbanCard } from './KanbanCard'

export function KanbanBoard({ avus }: { avus: Avu[] }) {
  const columns = Object.fromEntries(KANBAN_COLUMNS.map((key) => [key, [] as Avu[]])) as Record<
    KanbanColumnKey,
    Avu[]
  >

  for (const avu of avus) {
    const column = computeKanbanColumn(avu)
    if (column) columns[column].push(avu)
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map((key) => (
        <div key={key} className="flex w-72 shrink-0 flex-col gap-3">
          <div className="flex items-center justify-between rounded-xl bg-gray-100 px-3 py-2">
            <p className="text-sm font-medium text-graphite-700">{KANBAN_COLUMN_LABELS[key]}</p>
            <span className="text-xs text-gray-500">{columns[key].length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {columns[key].length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                Vazio
              </p>
            ) : (
              columns[key].map((avu) => <KanbanCard key={avu.id} avu={avu} />)
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
