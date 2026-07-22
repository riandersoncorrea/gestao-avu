import type maplibregl from 'maplibre-gl'
import type { MapStyleOption } from '../mapStyles'

/**
 * Controle de troca de camada/estilo do mapa — implementado como um `IControl` "vanilla"
 * (não React) porque `map.addControl()` empilha automaticamente com o `NavigationControl`
 * já existente no canto superior direito, sem precisar calcular offset/z-index manualmente.
 */
export class MapStyleControl implements maplibregl.IControl {
  private container: HTMLDivElement | null = null
  private select: HTMLSelectElement | null = null
  private options: MapStyleOption[]
  private value: string
  private onChange: (id: string) => void

  constructor(options: MapStyleOption[], value: string, onChange: (id: string) => void) {
    this.options = options
    this.value = value
    this.onChange = onChange
  }

  onAdd(): HTMLElement {
    this.container = document.createElement('div')
    this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group'

    this.select = document.createElement('select')
    this.select.setAttribute('aria-label', 'Camada do mapa')
    this.select.style.cssText =
      'border:none;background:transparent;padding:6px 8px;font-size:12px;font-family:inherit;color:#1f2937;cursor:pointer;outline:none;'

    for (const option of this.options) {
      const el = document.createElement('option')
      el.value = option.id
      el.disabled = !option.available
      el.textContent = option.available ? option.label : `${option.label} (não configurado)`
      this.select.appendChild(el)
    }
    this.select.value = this.value

    this.select.addEventListener('change', () => {
      if (this.select) this.onChange(this.select.value)
    })

    this.container.appendChild(this.select)
    return this.container
  }

  onRemove(): void {
    this.container?.parentNode?.removeChild(this.container)
    this.container = null
    this.select = null
  }

  setValue(id: string): void {
    this.value = id
    if (this.select) this.select.value = id
  }
}
