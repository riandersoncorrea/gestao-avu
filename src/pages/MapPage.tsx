import { PageHeader } from '@/components/PageHeader'
import { BaseMap } from '@/features/gis/components/BaseMap'

export function MapPage() {
  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Mapa"
        description="Mapa base da malha da EFC em São Luís. Camadas de AVUs georreferenciadas chegam em uma próxima sprint."
      />
      <div className="h-[calc(100vh-16rem)] min-h-96 overflow-hidden rounded-2xl border border-gray-200">
        <BaseMap />
      </div>
    </div>
  )
}
