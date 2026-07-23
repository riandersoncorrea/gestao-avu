import type maplibregl from 'maplibre-gl'

/**
 * Abstração de provedor de mapa — cada opção resolve pra uma URL de style.json (vetorial)
 * ou um `StyleSpecification` inline (raster). Trocar de provedor no futuro é só adicionar
 * uma entrada aqui; `BaseMap` não conhece detalhes de nenhum provedor específico.
 *
 * `available` controla se a opção aparece habilitada no controle de camadas — usado pra
 * não travar em cima de uma chave de API que não foi configurada (ver `satelite`/`hibrido`
 * abaixo). Sem a env var, o mapa continua funcionando normalmente só com as camadas livres.
 */
export interface MapStyleOption {
  id: string
  label: string
  styleUrl: string | maplibregl.StyleSpecification
  available: boolean
  unavailableReason?: string
}

function rasterStyle(tiles: string[], attribution: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      'raster-tiles': { type: 'raster', tiles, tileSize: 256, attribution },
    },
    layers: [{ id: 'raster-tiles-layer', type: 'raster', source: 'raster-tiles' }],
  }
}

// MapTiler (ou outro provedor de satélite) exige uma API key própria — não incluída aqui
// porque licença/custo precisam ser avaliados antes (ver CLAUDE.md/README desta feature).
// Sem a env var, as opções "Satélite"/"Híbrido" ficam visíveis mas desabilitadas no controle.
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined
const MAPTILER_UNAVAILABLE_REASON = 'Configure VITE_MAPTILER_KEY no .env para habilitar esta camada.'

export const MAP_STYLES: MapStyleOption[] = [
  {
    id: 'padrao',
    label: 'Padrão',
    // Causa raiz do bug "Light sem nomes de rua" (ver docs/testing.md): isto era
    // `https://demotiles.maplibre.org/style.json` — o style de DEMONSTRAÇÃO oficial do
    // MapLibre, com cobertura de dados esparsa e sem labels de rua/logradouro na prática.
    // Não é um basemap de produção, é uma amostra de teste. O style "escuro" ao lado
    // sempre teve labels porque usa tiles raster completos do CARTO (Dark Matter, com
    // texto já desenhado no próprio raster) — produtos diferentes, não uma diferença de
    // configuração de camada/zoom. Trocado pelo equivalente claro da mesma família CARTO
    // (Positron/"light_all") — mesmo provedor, mesmo esquema de tiles, mesma licença, sem
    // API key nova — pra ter paridade real de labels com o Escuro.
    styleUrl: rasterStyle(
      ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'],
      '© OpenStreetMap contributors © CARTO',
    ),
    available: true,
  },
  {
    id: 'escuro',
    label: 'Escuro',
    // CARTO Dark Matter — tiles raster públicos, sem API key, atribuição obrigatória.
    styleUrl: rasterStyle(
      ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'],
      '© OpenStreetMap contributors © CARTO',
    ),
    available: true,
  },
  {
    id: 'satelite',
    label: 'Satélite',
    styleUrl: MAPTILER_KEY ? `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}` : '',
    available: Boolean(MAPTILER_KEY),
    unavailableReason: MAPTILER_UNAVAILABLE_REASON,
  },
  {
    id: 'hibrido',
    label: 'Híbrido',
    styleUrl: MAPTILER_KEY ? `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}` : '',
    available: Boolean(MAPTILER_KEY),
    unavailableReason: MAPTILER_UNAVAILABLE_REASON,
  },
]

export const DEFAULT_MAP_STYLE_ID = 'padrao'

export function getMapStyle(id: string): MapStyleOption {
  return MAP_STYLES.find((option) => option.id === id) ?? MAP_STYLES[0]
}
