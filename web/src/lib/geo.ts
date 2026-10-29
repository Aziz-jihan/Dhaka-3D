import type { Position } from 'geojson'
import type { AreaFeature } from '../types'

function inRing(pt: Position, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inPolygon(pt: Position, rings: Position[][]): boolean {
  return inRing(pt, rings[0]) && !rings.slice(1).some((hole) => inRing(pt, hole))
}

export function areaAt(pt: Position, areas: AreaFeature[]): AreaFeature | undefined {
  return areas.find(({ geometry: g }) =>
    g.type === 'Polygon' ? inPolygon(pt, g.coordinates) : g.coordinates.some((poly) => inPolygon(pt, poly)),
  )
}

export function bboxOf(f: AreaFeature): [number, number, number, number] {
  const rings = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat()
  const pts = rings.flat()
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
