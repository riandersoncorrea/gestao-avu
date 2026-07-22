import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cn } from '@/lib/utils'
import { DEFAULT_MAP_STYLE_ID, MAP_STYLES, getMapStyle } from '../mapStyles'
import { MapStyleControl } from './mapStyleControl'

// Terminal Marítimo de Ponta da Madeira / São Luís, MA — sede da EFC.
const SAO_LUIS_EFC_CENTER: [number, number] = [-44.3697, -2.5307]

export interface MapMarker {
  longitude: number
  latitude: number
  label?: string
}

export interface HeatmapPoint {
  longitude: number
  latitude: number
}

export interface ClusteredMarker {
  id: string
  longitude: number
  latitude: number
  color: string
}

export interface FlyToTarget {
  longitude: number
  latitude: number
}

export interface BaseMapProps {
  className?: string
  center?: [number, number]
  zoom?: number
  markers?: MapMarker[]
  /** Camada de mapa de calor (MapLibre `heatmap` layer nativa) — usada pelo Dashboard
   * Executivo para o mapa de calor de vulnerabilidades. Independente de `markers`. */
  heatmapPoints?: HeatmapPoint[]
  /** Pontos coloridos com clustering nativo do MapLibre (fonte GeoJSON `cluster: true`) —
   * usada pelo mapa de vulnerabilidades (`pages/MapPage.tsx`). Independente de `markers`. */
  clusteredMarkers?: ClusteredMarker[]
  onClusteredMarkerClick?: (id: string) => void
  /** Realça o ponto selecionado (sincronização com a tabela ao lado). */
  selectedMarkerId?: string | null
  /** Centraliza o mapa numa coordenada sob demanda (ex.: clique numa linha da tabela). */
  flyTo?: FlyToTarget | null
  /** Camada/estilo inicial (ver `features/gis/mapStyles.ts`). Padrão: `DEFAULT_MAP_STYLE_ID`. */
  defaultStyleId?: string
  /** Mostra o controle de troca de camada no canto superior direito (junto do zoom). Padrão: `true`. */
  showStyleControl?: boolean
}

const HEATMAP_SOURCE_ID = 'avu-heatmap-source'
const HEATMAP_LAYER_ID = 'avu-heatmap-layer'

const CLUSTER_SOURCE_ID = 'avu-clusters-source'
const CLUSTERS_LAYER_ID = 'avu-clusters-circle'
const CLUSTER_COUNT_LAYER_ID = 'avu-cluster-count'
const UNCLUSTERED_LAYER_ID = 'avu-unclustered-point'

function heatmapGeoJson(points: HeatmapPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
    })),
  }
}

function applySelectionHighlight(map: maplibregl.Map, selectedMarkerId: string | null | undefined) {
  if (!map.getLayer(UNCLUSTERED_LAYER_ID)) return
  const isSelected = ['==', ['get', 'avuId'], selectedMarkerId ?? '__none__']
  map.setPaintProperty(UNCLUSTERED_LAYER_ID, 'circle-stroke-width', ['case', isSelected, 3, 1.5])
  map.setPaintProperty(UNCLUSTERED_LAYER_ID, 'circle-stroke-color', ['case', isSelected, '#3d0f20', '#ffffff'])
  map.setPaintProperty(UNCLUSTERED_LAYER_ID, 'circle-radius', ['case', isSelected, 11, 8])
}

function clusterGeoJson(points: ClusteredMarker[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => ({
      type: 'Feature' as const,
      properties: { avuId: point.id, color: point.color },
      geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
    })),
  }
}

/**
 * Mapa base (MapLibre GL). Sem `markers`, é só o mapa base da EFC (usado por `pages/MapPage.tsx`).
 * Com `markers`, plota pontos (usado pela aba "Localização" do detalhe da AVU) — fundação
 * para as futuras camadas GIS com todas as AVUs georreferenciadas.
 */
export function BaseMap({
  className,
  center,
  zoom = 10,
  markers = [],
  heatmapPoints,
  clusteredMarkers,
  onClusteredMarkerClick,
  selectedMarkerId,
  flyTo,
  defaultStyleId = DEFAULT_MAP_STYLE_ID,
  showStyleControl = true,
}: BaseMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const onClusteredMarkerClickRef = useRef(onClusteredMarkerClick)
  onClusteredMarkerClickRef.current = onClusteredMarkerClick
  const heatmapPointsRef = useRef<HeatmapPoint[]>(heatmapPoints ?? [])
  heatmapPointsRef.current = heatmapPoints ?? []
  const clusteredMarkersRef = useRef<ClusteredMarker[]>(clusteredMarkers ?? [])
  clusteredMarkersRef.current = clusteredMarkers ?? []
  const selectedMarkerIdRef = useRef(selectedMarkerId)
  selectedMarkerIdRef.current = selectedMarkerId
  const styleControlRef = useRef<MapStyleControl | null>(null)
  const isInitialStyleRef = useRef(true)
  // Incrementado sempre que o style base troca (troca de camada) — as camadas customizadas
  // (heatmap/cluster/realce) dependem dele pra saber que precisam ser recriadas, já que
  // `map.setStyle()` descarta todas as fontes/camadas anteriores.
  const [styleVersion, setStyleVersion] = useState(0)
  const [styleId, setStyleId] = useState(defaultStyleId)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(styleId).styleUrl,
      center: center ?? SAO_LUIS_EFC_CENTER,
      zoom,
    })

    mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right')

    if (showStyleControl) {
      const control = new MapStyleControl(MAP_STYLES, styleId, setStyleId)
      styleControlRef.current = control
      mapRef.current.addControl(control, 'top-right')
    }

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      styleControlRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Troca de camada/estilo (controle no canto superior direito). O style inicial já é
  // aplicado na criação do mapa acima — este efeito só cuida de trocas subsequentes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (isInitialStyleRef.current) {
      isInitialStyleRef.current = false
      return
    }

    map.setStyle(getMapStyle(styleId).styleUrl)
    styleControlRef.current?.setValue(styleId)
    setStyleVersion((v) => v + 1)
  }, [styleId])

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

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!heatmapPoints) {
      if (map.getLayer(HEATMAP_LAYER_ID)) map.removeLayer(HEATMAP_LAYER_ID)
      if (map.getSource(HEATMAP_SOURCE_ID)) map.removeSource(HEATMAP_SOURCE_ID)
      return
    }

    function applyHeatmap() {
      const source = map!.getSource(HEATMAP_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(heatmapGeoJson(heatmapPointsRef.current))
        return
      }

      // A fonte só pode ser adicionada depois que o style terminou de ser aplicado — mas não dá
      // pra confiar em `map.isStyleLoaded()`/evento `load` pra isso (eles só ficam `true`/disparam
      // quando TODOS os tiles do style base terminam de carregar, o que pode nunca acontecer numa
      // rede lenta/instável e travaria esta camada pra sempre). Em vez disso, tenta adicionar direto
      // e, se o style ainda não aceitar (exceção), tenta de novo no próximo `styledata`.
      try {
        map!.addSource(HEATMAP_SOURCE_ID, { type: 'geojson', data: heatmapGeoJson(heatmapPointsRef.current) })
      } catch {
        map!.once('styledata', applyHeatmap)
        return
      }

      map!.addLayer({
        id: HEATMAP_LAYER_ID,
        type: 'heatmap',
        source: HEATMAP_SOURCE_ID,
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': 1,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(14,155,138,0)',
            0.3,
            '#a6dfd6',
            0.6,
            '#c6376b',
            1,
            '#5e1732',
          ],
          'heatmap-radius': 24,
          'heatmap-opacity': 0.8,
        },
      })
    }

    applyHeatmap()
  }, [heatmapPoints, styleVersion])

  // Clustering: fonte GeoJSON com `cluster: true` — o MapLibre/supercluster agrupa pontos
  // próximos conforme o zoom automaticamente, sem lógica de "quando é muito" no nosso código.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (!clusteredMarkers) {
      for (const layerId of [CLUSTERS_LAYER_ID, CLUSTER_COUNT_LAYER_ID, UNCLUSTERED_LAYER_ID]) {
        if (map.getLayer(layerId)) map.removeLayer(layerId)
      }
      if (map.getSource(CLUSTER_SOURCE_ID)) map.removeSource(CLUSTER_SOURCE_ID)
      return
    }

    function setupLayers(): boolean {
      try {
        map!.addSource(CLUSTER_SOURCE_ID, {
          type: 'geojson',
          data: clusterGeoJson(clusteredMarkersRef.current),
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        })
      } catch {
        return false
      }

      map!.addLayer({
        id: CLUSTERS_LAYER_ID,
        type: 'circle',
        source: CLUSTER_SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0e9b8a',
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
          'circle-opacity': 0.85,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      map!.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: 'symbol',
        source: CLUSTER_SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      })

      map!.addLayer({
        id: UNCLUSTERED_LAYER_ID,
        type: 'circle',
        source: CLUSTER_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': 8,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      })

      map!.on('click', CLUSTERS_LAYER_ID, async (e) => {
        const features = map!.queryRenderedFeatures(e.point, { layers: [CLUSTERS_LAYER_ID] })
        const clusterId = features[0]?.properties?.cluster_id
        const source = map!.getSource(CLUSTER_SOURCE_ID) as maplibregl.GeoJSONSource
        if (clusterId === undefined) return
        const targetZoom = await source.getClusterExpansionZoom(clusterId)
        const geometry = features[0].geometry as { coordinates: [number, number] }
        map!.easeTo({ center: geometry.coordinates, zoom: targetZoom })
      })

      map!.on('click', UNCLUSTERED_LAYER_ID, (e) => {
        const avuId = e.features?.[0]?.properties?.avuId as string | undefined
        if (avuId) onClusteredMarkerClickRef.current?.(avuId)
      })

      for (const layerId of [CLUSTERS_LAYER_ID, UNCLUSTERED_LAYER_ID]) {
        map!.on('mouseenter', layerId, () => {
          map!.getCanvas().style.cursor = 'pointer'
        })
        map!.on('mouseleave', layerId, () => {
          map!.getCanvas().style.cursor = ''
        })
      }

      applySelectionHighlight(map!, selectedMarkerIdRef.current)
      return true
    }

    // Mesma ressalva do heatmap: não dá pra esperar `map.isStyleLoaded()`/evento `load` (só ficam
    // prontos quando todos os tiles do style base terminam de carregar, o que pode nunca acontecer).
    // Tenta adicionar a fonte direto; se o style ainda não aceitar, tenta de novo no próximo `styledata`.
    function applyClusters() {
      const source = map!.getSource(CLUSTER_SOURCE_ID) as maplibregl.GeoJSONSource | undefined
      if (source) {
        source.setData(clusterGeoJson(clusteredMarkersRef.current))
        return
      }
      if (!setupLayers()) map!.once('styledata', applyClusters)
    }

    applyClusters()
  }, [clusteredMarkers, styleVersion])

  // Realce do ponto selecionado — atualiza só a expressão de estilo do layer, sem recarregar
  // os dados da fonte (sincronização com a linha selecionada na tabela).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    applySelectionHighlight(map, selectedMarkerId)
  }, [selectedMarkerId, clusteredMarkers, styleVersion])

  // Centraliza o mapa sob demanda (ex.: clique numa AVU na tabela).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTo) return
    map.flyTo({ center: [flyTo.longitude, flyTo.latitude], zoom: Math.max(zoom, 14) })
  }, [flyTo, zoom])

  return <div ref={containerRef} className={cn('h-full w-full rounded-2xl', className)} />
}
