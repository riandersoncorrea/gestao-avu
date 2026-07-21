import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cn } from '@/lib/utils'

// Terminal Marítimo de Ponta da Madeira / São Luís, MA — sede da EFC.
const SAO_LUIS_EFC_CENTER: [number, number] = [-44.3697, -2.5307]

export interface MapMarker {
  longitude: number
  latitude: number
  label?: string
}

export interface BaseMapProps {
  className?: string
  center?: [number, number]
  zoom?: number
  markers?: MapMarker[]
}

/**
 * Mapa base (MapLibre GL). Sem `markers`, é só o mapa base da EFC (usado por `pages/MapPage.tsx`).
 * Com `markers`, plota pontos (usado pela aba "Localização" do detalhe da AVU) — fundação
 * para as futuras camadas GIS com todas as AVUs georreferenciadas.
 */
export function BaseMap({ className, center, zoom = 10, markers = [] }: BaseMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: center ?? SAO_LUIS_EFC_CENTER,
      zoom,
    })

    mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((marker) => marker.remove())
    markersRef.current = markers.map((marker) => {
      const el = new maplibregl.Marker({ color: '#0E9B8A' })
        .setLngLat([marker.longitude, marker.latitude])
        .addTo(map)
      if (marker.label) el.setPopup(new maplibregl.Popup({ offset: 24 }).setText(marker.label))
      return el
    })

    if (markers.length > 0) {
      map.jumpTo({ center: [markers[0].longitude, markers[0].latitude], zoom: Math.max(zoom, 13) })
    }
  }, [markers, zoom])

  return <div ref={containerRef} className={cn('h-full w-full rounded-2xl', className)} />
}
