import type { Map as MlMap } from 'maplibre-gl'
import { bboxOf } from '../lib/geo'
import type { CityData, Selection } from '../types'

// Generous: at steep pitch MapLibre keeps the whole horizon inside these bounds,
// so tight bounds would pull the camera back from the opening view
export const DHAKA_BOUNDS: [[number, number], [number, number]] = [
  [89.9, 23.3],
  [90.9, 24.2],
]

/** Opening shot: looking north-east over Ramna towards Gulshan, sun behind the camera */
export const DEFAULT_VIEW = {
  center: [90.4035, 23.7445] as [number, number],
  zoom: 14.3,
  pitch: 72,
  bearing: 32,
}

export function resetView(map: MlMap) {
  map.flyTo({ ...DEFAULT_VIEW, duration: 2500, essential: true })
}

export function focusSelection(map: MlMap, data: CityData, sel: Selection) {
  const ease = { pitch: 62, bearing: map.getBearing(), duration: 2600, essential: true }

  if (sel.type === 'area') {
    const area = data.areas.features.find((f) => f.properties.slug === sel.slug)
    if (!area) return
    const [w, s, e, n] = bboxOf(area)
    map.fitBounds([[w, s], [e, n]], { ...ease, padding: panelPadding(), maxZoom: 15.5 })
  } else if (sel.type === 'landmark') {
    const lm = data.landmarks.features.find((f) => f.properties.slug === sel.slug)
    if (!lm) return
    map.flyTo({ ...ease, center: lm.geometry.coordinates as [number, number], zoom: 16.4, padding: panelPadding() })
  } else if (sel.type === 'place') {
    const { place } = sel
    if (place.bounds) {
      const [w, s, e, n] = place.bounds
      map.fitBounds([[w, s], [e, n]], { ...ease, padding: panelPadding(), maxZoom: 16 })
    } else {
      map.flyTo({ ...ease, center: place.center, zoom: 16, padding: panelPadding() })
    }
  }
}

/** Keep the focus clear of the side panel on wide screens and the bottom sheet on phones */
function panelPadding() {
  const wide = window.matchMedia('(min-width: 768px)').matches
  return wide ? { left: 380, top: 60, right: 60, bottom: 60 } : { left: 30, top: 80, right: 30, bottom: 260 }
}
