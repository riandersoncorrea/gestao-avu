import { MARKER_COLOR_KEYS, MARKER_COLORS } from '../markerColor'

export function MapLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
      {MARKER_COLOR_KEYS.map((key) => {
        const { color, label } = MARKER_COLORS[key]
        return (
          <div key={key} className="flex items-center gap-1.5 text-xs text-graphite-700">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
            {label}
          </div>
        )
      })}
    </div>
  )
}
