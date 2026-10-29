/// <reference lib="webworker" />
/**
 * Fetches one building tile from the PMTiles archive, decodes it and builds
 * its mesh off the main thread. Replies with transferable typed arrays.
 */
import { PMTiles } from 'pmtiles'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { buildMesh, type BuildingInput, type MeshArrays } from './geometry'

export interface Origin {
  /** origin in Web Mercator units (0..1) */
  x: number
  y: number
  /** Mercator units per metre at the origin */
  scale: number
}

/** Circle (local metres) where a landmark model stands; footprints centred inside are skipped */
export interface ClearZone {
  x: number
  y: number
  r: number
}

export interface BuildingProps {
  h: number
  b: number
  src: number
  name?: string
}

export type WorkerRequest =
  | { type: 'init'; url: string; origin: Origin; clear: ClearZone[] }
  | { type: 'tile'; key: string; z: number; x: number; y: number; clutter: boolean }

export type WorkerResponse =
  | { type: 'tile'; key: string; mesh: MeshArrays | null; props: [number, BuildingProps][] }
  | { type: 'error'; key: string; message: string }

const LAYER = 'buildings'

let archive: PMTiles
let origin: Origin
let clear: ClearZone[] = []

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.type === 'init') {
    archive = new PMTiles(msg.url)
    origin = msg.origin
    clear = msg.clear
    return
  }
  try {
    const res = await archive.getZxy(msg.z, msg.x, msg.y)
    const layer = res && new VectorTile(new Pbf(new Uint8Array(res.data))).layers[LAYER]
    if (!layer) {
      reply({ type: 'tile', key: msg.key, mesh: null, props: [] })
      return
    }
    const n = 2 ** msg.z
    const k = 1 / (layer.extent * n * origin.scale)
    const x0 = (msg.x / n - origin.x) / origin.scale
    const y0 = (msg.y / n - origin.y) / origin.scale

    const buildings: BuildingInput[] = []
    const props: [number, BuildingProps][] = []
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i)
      const id = Number(f.id)
      const p = f.properties
      const height = Number(p.h)
      const base = Number(p.b) || 0
      // Tile pixels (y down) -> local metres (y north). A feature can hold several
      // polygons; split them where an outer ring (same winding as the first) starts.
      const rings = f.loadGeometry().map((ring) => {
        const pts = ring.map((pt) => [x0 + pt.x * k, -(y0 + pt.y * k)] as [number, number])
        if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop()
        return pts
      })
      for (const polygon of splitPolygons(rings)) {
        if (!underLandmark(polygon[0])) buildings.push({ id, rings: polygon, height, base })
      }
      props.push([id, { h: height, b: base, src: Number(p.src), ...(p.name ? { name: String(p.name) } : {}) }])
    }
    const mesh = buildMesh(buildings, msg.clutter)
    reply({ type: 'tile', key: msg.key, mesh, props }, [
      mesh.position.buffer,
      mesh.normal.buffer,
      mesh.wall.buffer,
      mesh.bld.buffer,
      mesh.index.buffer,
    ])
  } catch (err) {
    reply({ type: 'error', key: msg.key, message: (err as Error).message })
  }
}

function reply(msg: WorkerResponse, transfer: Transferable[] = []) {
  ctx.postMessage(msg, transfer)
}

/** Footprint centred near a landmark model, or one that covers the landmark's spot (e.g. its mapped platform) */
function underLandmark(ring: [number, number][]) {
  if (!clear.length) return false
  let cx = 0
  let cy = 0
  for (const [x, y] of ring) {
    cx += x
    cy += y
  }
  cx /= ring.length
  cy /= ring.length
  return clear.some((c) => Math.hypot(cx - c.x, cy - c.y) < c.r || contains(ring, c.x, c.y))
}

function contains(ring: [number, number][], x: number, y: number) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function ringArea(r: [number, number][]) {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1])
  return a
}

function splitPolygons(rings: [number, number][][]): [number, number][][][] {
  const polygons: [number, number][][][] = []
  let outerSign = 0
  for (const ring of rings) {
    const a = ringArea(ring)
    if (a === 0) continue
    if (!outerSign) outerSign = Math.sign(a)
    if (Math.sign(a) === outerSign || !polygons.length) polygons.push([ring])
    else polygons[polygons.length - 1].push(ring)
  }
  return polygons
}
