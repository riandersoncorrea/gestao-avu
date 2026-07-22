import { Card, CardContent, CardHeader, CardTitle } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { StatusBadge } from '@/components/StatusBadge'
import type { CriticalArea } from '../analytics'

export function CriticalAreasRanking({ areas }: { areas: CriticalArea[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ranking de áreas críticas</CardTitle>
      </CardHeader>
      <CardContent>
        {areas.length === 0 ? (
          <EmptyState
            title="Sem dados"
            description="Nenhuma AVU com gerência responsável definida nos filtros atuais."
            className="border-none px-0 py-8"
          />
        ) : (
          <ol className="flex flex-col gap-2">
            {areas.map((area, index) => (
              <li key={area.area} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                    {index + 1}
                  </span>
                  <span className="text-sm text-graphite-800">{area.area}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone="danger" label={`${area.criticalCount} crítica(s)`} />
                  <span className="text-xs text-gray-500">de {area.total}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
