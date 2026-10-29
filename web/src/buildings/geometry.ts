/**
 * Turns building polygons into one merged mesh per tile.
 *
 * Coordinates are local metres around a fixed origin (x east, y north, z up),
 * which keeps float32 precision across the whole city.
 *
 * Vertex attributes:
 * - position, normal
 * - aWall: (u, v) metres along the wall from its centre, and height above ground;
 *          for roofs the local x/y, so roof stains don't line up between buildings
 * - aBld:  (building id, roof height, kind)
 */
import earcut from 'earcut'

export const KIND = { wall: 0, roof: 1, stairWall: 2, stairRoof: 3, tank: 4 } as const

/** Buildings taller than this are glass towers: no parapet, no rooftop clutter */
export const GLASS_TOWER_M = 45
const PARAPET_M = 1.0
const STAIR_ROOM = { size: 2.6, height: 2.7 }
const TANK = { radius: 0.75, height: 1.3, segments: 6 }

export interface BuildingInput {
  id: number
  /** rings in local metres; first ring is the outer one */
  rings: [number, number][][]
  height: number
  base: number
}

export interface MeshArrays {
  position: Float32Array
  normal: Int8Array
  wall: Float32Array
  bld: Float32Array
  index: Uint32Array
}

class Builder {
  pos: number[] = []
  nrm: number[] = []
  wall: number[] = []
  bld: number[] = []
  idx: number[] = []

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, id: number, roof: number, kind: number) {
    this.pos.push(x, y, z)
    this.nrm.push(Math.round(nx * 127), Math.round(ny * 127), Math.round(nz * 127), 0)
    this.wall.push(u, v)
    this.bld.push(id, roof, kind)
    return this.pos.length / 3 - 1
  }

  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d)
  }

  arrays(): MeshArrays {
    return {
      position: new Float32Array(this.pos),
      normal: new Int8Array(this.nrm),
      wall: new Float32Array(this.wall),
      bld: new Float32Array(this.bld),
      index: new Uint32Array(this.idx),
    }
  }
}

function signedArea(ring: [number, number][]) {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
  return a / 2 // > 0 means counter-clockwise with y pointing north
}

function inRing([x, y]: [number, number], ring: [number, number][]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Small deterministic hash so rooftop clutter is the same on every visit */
function hash(n: number) {
  const s = Math.sin(n * 12.9898) * 43758.5453
  return s - Math.floor(s)
}

function addWalls(b: Builder, ring: [number, number][], outward: number, bot: number, top: number, id: number, roof: number, kind: number) {
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i]
    const [x1, y1] = ring[(i + 1) % ring.length]
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy)
    if (len < 0.05) continue
    const nx = (dy / len) * outward
    const ny = (-dx / len) * outward
    const h = len / 2 // u runs from -len/2 to +len/2 so window bays sit centred on each wall
    const a = b.vertex(x0, y0, bot, nx, ny, 0, -h, bot, id, roof, kind)
    const c = b.vertex(x1, y1, bot, nx, ny, 0, h, bot, id, roof, kind)
    const d = b.vertex(x1, y1, top, nx, ny, 0, h, top, id, roof, kind)
    const e = b.vertex(x0, y0, top, nx, ny, 0, -h, top, id, roof, kind)
    // Counter-clockwise seen from outside, so double-sided lighting flips the right face
    if (outward > 0) b.quad(a, c, d, e)
    else b.quad(a, e, d, c)
  }
}

function addFlat(b: Builder, rings: [number, number][][], z: number, id: number, roof: number, kind: number) {
  const flat: number[] = []
  const holes: number[] = []
  for (const r of rings) {
    if (flat.length) holes.push(flat.length / 2)
    for (const [x, y] of r) flat.push(x, y)
  }
  const tris = earcut(flat, holes)
  const first = b.pos.length / 3
  for (let i = 0; i < flat.length; i += 2) b.vertex(flat[i], flat[i + 1], z, 0, 0, 1, flat[i], flat[i + 1], id, roof, kind)
  for (let i = 0; i < tris.length; i += 3) {
    const [p, q, r] = [tris[i], tris[i + 1], tris[i + 2]]
    const cross =
      (flat[q * 2] - flat[p * 2]) * (flat[r * 2 + 1] - flat[p * 2 + 1]) -
      (flat[r * 2] - flat[p * 2]) * (flat[q * 2 + 1] - flat[p * 2 + 1])
    // Face up (counter-clockwise from above) whatever order earcut returned
    if (cross >= 0) b.idx.push(first + p, first + q, first + r)
    else b.idx.push(first + p, first + r, first + q)
  }
  return { flat, tris }
}

/** Axis-aligned-to-the-building box (stair-head room) */
function addBox(b: Builder, cx: number, cy: number, ax: number, ay: number, half: number, z0: number, z1: number, id: number, roof: number) {
  const px = -ay
  const py = ax
  const ring: [number, number][] = [
    [cx - ax * half - px * half, cy - ay * half - py * half],
    [cx + ax * half - px * half, cy + ay * half - py * half],
    [cx + ax * half + px * half, cy + ay * half + py * half],
    [cx - ax * half + px * half, cy - ay * half + py * half],
  ]
  addWalls(b, ring, 1, z0, z1, id, roof, KIND.stairWall)
  addFlat(b, [ring], z1, id, roof, KIND.stairRoof)
}

function addTank(b: Builder, cx: number, cy: number, z0: number, id: number, roof: number) {
  const { radius: r, height, segments: n } = TANK
  const z1 = z0 + height
  const top: number[] = []
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    const m = (a0 + a1) / 2
    const [nx, ny] = [Math.cos(m), Math.sin(m)]
    const p0: [number, number] = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r]
    const p1: [number, number] = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r]
    const a = b.vertex(p0[0], p0[1], z0, nx, ny, 0, 0, z0, id, roof, KIND.tank)
    const c = b.vertex(p1[0], p1[1], z0, nx, ny, 0, 0, z0, id, roof, KIND.tank)
    const d = b.vertex(p1[0], p1[1], z1, nx, ny, 0, 0, z1, id, roof, KIND.tank)
    const e = b.vertex(p0[0], p0[1], z1, nx, ny, 0, 0, z1, id, roof, KIND.tank)
    b.quad(a, c, d, e)
    top.push(b.vertex(p0[0], p0[1], z1, 0, 0, 1, 0, z1, id, roof, KIND.tank))
  }
  for (let i = 1; i < n - 1; i++) b.idx.push(top[0], top[i], top[i + 1])
}

/** Stair-head room and one or two water tanks on an ordinary Dhaka rooftop */
function addRoofClutter(b: Builder, rings: [number, number][][], flat: number[], tris: number[], area: number, roof: number, id: number) {
  if (area < 70 || roof < 7 || roof >= GLASS_TOWER_M) return
  // Place everything around the centre of the largest roof triangle: always inside the roof
  let best = -1
  let bestArea = 0
  for (let i = 0; i < tris.length; i += 3) {
    const [a, c, d] = [tris[i] * 2, tris[i + 1] * 2, tris[i + 2] * 2]
    const t = Math.abs((flat[c] - flat[a]) * (flat[d + 1] - flat[a + 1]) - (flat[d] - flat[a]) * (flat[c + 1] - flat[a + 1])) / 2
    if (t > bestArea) [best, bestArea] = [i, t]
  }
  if (best < 0) return
  const [a, c, d] = [tris[best] * 2, tris[best + 1] * 2, tris[best + 2] * 2]
  const cx = (flat[a] + flat[c] + flat[d]) / 3
  const cy = (flat[a + 1] + flat[c + 1] + flat[d + 1]) / 3

  // Align with the longest wall so the clutter sits square to the building
  const outer = rings[0]
  let ax = 1
  let ay = 0
  let longest = 0
  for (let i = 0; i < outer.length; i++) {
    const [x0, y0] = outer[i]
    const [x1, y1] = outer[(i + 1) % outer.length]
    const len = Math.hypot(x1 - x0, y1 - y0)
    if (len > longest) [longest, ax, ay] = [len, (x1 - x0) / len, (y1 - y0) / len]
  }

  const half = STAIR_ROOM.size / 2
  const fits = (x: number, y: number, pad: number) =>
    [[pad, pad], [-pad, pad], [pad, -pad], [-pad, -pad]].every(([ox, oy]) => inRing([x + ox, y + oy], outer))
  if (hash(id) < 0.85 && fits(cx, cy, half)) addBox(b, cx, cy, ax, ay, half, roof, roof + STAIR_ROOM.height, id, roof)

  const tanks = hash(id + 7) < 0.5 ? 1 : 2
  for (let k = 0; k < tanks; k++) {
    const off = half + TANK.radius + 0.4 + k * (TANK.radius * 2 + 0.3)
    const tx = cx + ax * off
    const ty = cy + ay * off
    // Tanks usually stand on the stair room roof or on a low stand beside it
    if (fits(tx, ty, TANK.radius)) addTank(b, tx, ty, roof + (hash(id + k) < 0.4 ? STAIR_ROOM.height : 0.4), id, roof)
  }
}

export function buildMesh(buildings: BuildingInput[], withClutter: boolean): MeshArrays {
  const b = new Builder()
  for (const bd of buildings) {
    const rings = bd.rings.filter((r) => r.length >= 3)
    if (!rings.length) continue
    const outerArea = signedArea(rings[0])
    if (Math.abs(outerArea) < 1) continue
    // Normal (dy, -dx) points outward for a counter-clockwise outer ring and its clockwise holes
    const outward = outerArea > 0 ? 1 : -1
    const roof = bd.height
    const glass = roof >= GLASS_TOWER_M
    const wallTop = glass ? roof : roof + PARAPET_M
    for (const ring of rings) addWalls(b, ring, outward, bd.base, wallTop, bd.id, roof, KIND.wall)
    const { flat, tris } = addFlat(b, rings, roof, bd.id, roof, KIND.roof)
    if (withClutter) addRoofClutter(b, rings, flat, tris, Math.abs(outerArea), roof, bd.id)
  }
  return b.arrays()
}
