import { Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card'
import { KpiCard } from '@/components/KpiCard'
import { EmptyState } from '@/components/EmptyState'
import type { GroupCycleTime } from '../analytics'

function formatDays(days: number | null): string {
  return days === null ? '—' : `${days.toFixed(1)} dias`
}

export function CycleTimeIndicators({
  averageDays,
  byGerencia,
  byEmpresa,
}: {
  averageDays: number | null
  byGerencia: GroupCycleTime[]
  byEmpresa: GroupCycleTime[]
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <KpiCard label="Tempo médio de atendimento" value={formatDays(averageDays)} icon={Clock} />

      <Card>
        <CardHeader>
          <CardTitle>Tempo médio por gerência</CardTitle>
        </CardHeader>
        <CardContent>
          {byGerencia.length === 0 ? (
            <EmptyState title="Sem dados" description="Nenhuma AVU concluída no período." className="border-none px-0 py-4" />
          ) : (
            <ul className="flex flex-col gap-2">
              {byGerencia.map((entry) => (
                <li key={entry.key} className="flex items-center justify-between text-sm">
                  <span className="text-graphite-700">{entry.key}</span>
                  <span className="font-medium text-graphite-800">{formatDays(entry.avgDays)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tempo médio por contratada</CardTitle>
        </CardHeader>
        <CardContent>
          {byEmpresa.length === 0 ? (
            <EmptyState title="Sem dados" description="Nenhuma AVU concluída no período." className="border-none px-0 py-4" />
          ) : (
            <ul className="flex flex-col gap-2">
              {byEmpresa.map((entry) => (
                <li key={entry.key} className="flex items-center justify-between text-sm">
                  <span className="text-graphite-700">{entry.key}</span>
                  <span className="font-medium text-graphite-800">{formatDays(entry.avgDays)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
