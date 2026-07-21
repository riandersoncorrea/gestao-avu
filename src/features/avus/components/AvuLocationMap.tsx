import { MapPin } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { BaseMap } from '@/features/gis/components/BaseMap'
import type { Avu } from '../types'

export function AvuLocationMap({ avu }: { avu: Avu }) {
  if (avu.latitude === null || avu.longitude === null) {
    return (
      <EmptyState
        icon={MapPin}
        title="Sem coordenadas"
        description="Esta AVU ainda não tem latitude/longitude cadastradas."
      />
    )
  }

  return (
    <div className="h-96 overflow-hidden rounded-2xl border border-gray-200">
      <BaseMap
        center={[avu.longitude, avu.latitude]}
        markers={[{ longitude: avu.longitude, latitude: avu.latitude, label: avu.numeroAvu }]}
      />
    </div>
  )
}
