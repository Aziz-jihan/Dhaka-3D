/**
 * MRT Line 6 in 3D: the elevated viaduct, its piers and stations, and
 * six-car trains running both ways that stop at every station.
 *
 * Works in the building layer's local metres (x east, y north, z up).
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { MetroProps } from '../types'

type V2 = [number, number]

const DECK_TOP = 11
const DECK_THICK = 1.8
const DECK_WIDTH = 5.6
const PIER_SPACING = 40
const CAR = { length: 19.8, gap: 0.5, width: 2.9, height: 3.7, count: 6 }
const SPEED = 16 // m/s, about 58 km/h between stations
const DWELL = 25 // s at each station
/** Trains per direction, spread evenly over the timetable */
const TRAINS_PER_TRACK = 4
/** Joins track pieces whose ends are this close (m) */
const JOIN_M = 20

interface Track {
  pts: V2[]
  /** cumulative distance at each point */
  cum: number[]
  length: number
  /** timetable: moving or waiting, from t0 to t1 between distances s0 and s1 */
  legs: { t0: number; t1: number; s0: number; s1: number }[]
  cycle: number
}

const dist = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Does `b` carry on roughly the way `a` was heading? (A U-turn means a terminal, not a joint) */
function continues(a: V2[], b: V2[]) {
  const [p, q] = [a[a.length - 2], a[a.length - 1]]
  const [r, s] = [b[0], b[1]]
  return (q[0] - p[0]) * (s[0] - r[0]) + (q[1] - p[1]) * (s[1] - r[1]) > 0
}

/**
 * Chain loose track pieces into continuous lines. Pieces join only end-to-start
 * in their mapped direction: each direction of the line is its own OSM track,
 * and at the terminals the two directions' ends lie close together.
 */
function chain(pieces: V2[][]): V2[][] {
  const left = pieces.map((p) => [...p])
  const chains: V2[][] = []
  while (left.length) {
    let line = left.shift()!
    for (let grown = true; grown; ) {
      grown = false
      for (let i = 0; i < left.length; i++) {
        const p = left[i]
        if (dist(line[line.length - 1], p[0]) < JOIN_M && continues(line, p)) line = [...line, ...p.slice(1)]
        else if (dist(p[p.length - 1], line[0]) < JOIN_M && continues(p, line)) line = [...p.slice(0, -1), ...line]
        else continue
        left.splice(i, 1)
        grown = true
        break
      }
    }
    chains.push(line)
  }
  return chains.sort((a, b) => b.length - a.length)
}

function measure(pts: V2[]) {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]))
  return cum
}

/** Point and direction at distance s along a track */
function at(t: Track, s: number): { p: V2; dir: V2 } {
  let lo = 0
  let hi = t.cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (t.cum[mid] <= s) lo = mid
    else hi = mid
  }
  const a = t.pts[lo]
  const b = t.pts[hi]
  const seg = t.cum[hi] - t.cum[lo] || 1
  const k = Math.min(1, Math.max(0, (s - t.cum[lo]) / seg))
  return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], dir: [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg] }
}

/** Distance along the track of the vertex nearest to a point */
function project(t: Track, q: V2) {
  let best = 0
  let bestD = Infinity
  t.pts.forEach((p, i) => {
    const d = dist(p, q)
    if (d < bestD) [best, bestD] = [i, d]
  })
  return { s: t.cum[best], d: bestD }
}

function timetable(t: Track, stops: number[]) {
  const legs: Track['legs'] = []
  let time = 0
  let pos = 0
  for (const s of [...stops.filter((x) => x > 0 && x < t.length).sort((a, b) => a - b), t.length]) {
    const travel = (s - pos) / SPEED
    legs.push({ t0: time, t1: time + travel, s0: pos, s1: s })
    time += travel
    pos = s
    if (s < t.length) {
      legs.push({ t0: time, t1: time + DWELL, s0: s, s1: s })
      time += DWELL
    }
  }
  t.legs = legs
  t.cycle = time
}

function positionAt(t: Track, time: number) {
  const c = ((time % t.cycle) + t.cycle) % t.cycle
  const leg = t.legs.find((l) => c < l.t1) ?? t.legs[t.legs.length - 1]
  const k = leg.t1 > leg.t0 ? (c - leg.t0) / (leg.t1 - leg.t0) : 0
  return leg.s0 + (leg.s1 - leg.s0) * k
}

/** A box ribbon following a polyline: the viaduct deck */
function ribbon(pts: V2[], width: number, z0: number, z1: number): THREE.BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(n - 1, i + 1)]
    const len = dist(a, b) || 1
    const nx = -(b[1] - a[1]) / len
    const ny = (b[0] - a[0]) / len
    const [x, y] = pts[i]
    const h = width / 2
    // left-top, right-top, right-bottom, left-bottom
    pos.push(x + nx * h, y + ny * h, z1, x - nx * h, y - ny * h, z1, x - nx * h, y - ny * h, z0, x + nx * h, y + ny * h, z0)
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 4
    const b = a + 4
    const quad = (p: number, q: number) => idx.push(a + p, b + p, b + q, a + p, b + q, a + q)
    quad(0, 1) // top
    quad(1, 2) // right side
    quad(2, 3) // bottom
    quad(3, 0) // left side
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function coloured(geom: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex)
  const n = geom.getAttribute('position').count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  geom.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return geom.toNonIndexed()
}

/** One car: white body, dark window band, green and red stripes (the national colours) */
function carGeometry() {
  const { length: l, width: w, height: h } = CAR
  const part = (pw: number, ph: number, z: number, hex: string, pl = l) => {
    const g = new THREE.BoxGeometry(pl, pw, ph)
    g.translate(0, 0, z + ph / 2)
    return coloured(g, hex)
  }
  return mergeGeometries([
    part(w, h - 0.3, 0.3, '#e9eef0'),
    part(w + 0.04, 0.95, 1.85, '#1b2328', l - 0.6),
    part(w + 0.05, 0.35, 1.2, '#1f7a4d'),
    part(w + 0.05, 0.18, 1.0, '#c62828'),
    part(w * 0.8, 0.3, 0, '#3a3f44', l - 2),
  ])!
}

export class MetroLine {
  readonly group = new THREE.Group()
  private readonly tracks: Track[] = []
  private readonly cars: THREE.InstancedMesh
  private readonly bounds = new THREE.Sphere()
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly v = new THREE.Vector3()
  private readonly up = new THREE.Vector3(0, 0, 1)
  private readonly one = new THREE.Vector3(1, 1, 1)

  constructor(data: FeatureCollection, toLocal: (lng: number, lat: number) => V2) {
    const features = data.features as Feature<LineString | Point, MetroProps>[]
    const pieces = features
      .filter((f): f is Feature<LineString, MetroProps> => f.geometry.type === 'LineString')
      .map((f) => f.geometry.coordinates.map(([lng, lat]) => toLocal(lng, lat)))
    // The two longest chains are the two directions of the line
    const lines = chain(pieces).slice(0, 2)
    if (lines.length === 2 && dist(lines[0][0], lines[1][0]) < dist(lines[0][0], lines[1][lines[1].length - 1])) {
      lines[1].reverse() // run the second direction the other way
    }
    for (const pts of lines) {
      const cum = measure(pts)
      this.tracks.push({ pts, cum, length: cum[cum.length - 1], legs: [], cycle: 1 })
    }
    if (!this.tracks.length) {
      this.cars = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 0)
      return
    }

    const stations = features
      .filter((f): f is Feature<Point, MetroProps> => f.geometry.type === 'Point')
      .map((f) => toLocal(f.geometry.coordinates[0], f.geometry.coordinates[1]))
    for (const t of this.tracks) timetable(t, stations.map((s) => project(t, s).s))

    const concrete = new THREE.MeshStandardMaterial({ color: '#c9c4ba', roughness: 0.9 })
    for (const t of this.tracks) {
      const deck = new THREE.Mesh(ribbon(t.pts, DECK_WIDTH, DECK_TOP - DECK_THICK, DECK_TOP), concrete)
      this.group.add(deck)
    }
    this.addPiers(concrete)
    this.addStations(stations)

    this.cars = new THREE.InstancedMesh(
      carGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 }),
      this.tracks.length * TRAINS_PER_TRACK * CAR.count,
    )
    this.cars.frustumCulled = false
    this.group.add(this.cars)

    this.group.traverse((o) => {
      o.castShadow = true
      o.receiveShadow = true
    })
    new THREE.Box3().setFromObject(this.group).getBoundingSphere(this.bounds)
  }

  /** Piers under the first track, centred between both tracks where they run side by side */
  private addPiers(material: THREE.Material) {
    const [a, b] = this.tracks
    const spots: V2[] = []
    for (let s = PIER_SPACING / 2; s < a.length; s += PIER_SPACING) {
      const p = at(a, s).p
      const near = b ? b.pts.reduce((best, q) => (dist(q, p) < dist(best, p) ? q : best), b.pts[0]) : null
      spots.push(near && dist(near, p) < 15 ? [(p[0] + near[0]) / 2, (p[1] + near[1]) / 2] : p)
    }
    const geom = new THREE.CylinderGeometry(1.1, 1.3, DECK_TOP - DECK_THICK, 10)
    geom.rotateX(Math.PI / 2)
    geom.translate(0, 0, (DECK_TOP - DECK_THICK) / 2)
    const piers = new THREE.InstancedMesh(geom, material, spots.length)
    spots.forEach(([x, y], i) => piers.setMatrixAt(i, this.m.makeTranslation(x, y, 0)))
    this.group.add(piers)
  }

  /** Station halls straddling the viaduct, aligned with the track */
  private addStations(stations: V2[]) {
    const t = this.tracks[0]
    const hall = new THREE.MeshStandardMaterial({ color: '#dfe3e3', roughness: 0.6 })
    const glass = new THREE.MeshStandardMaterial({ color: '#58707a', roughness: 0.25 })
    for (const st of stations) {
      const { s, d } = project(t, st)
      if (d > 60) continue
      const { p, dir } = at(t, s)
      const g = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(140, 20, 5.5), glass)
      body.position.z = DECK_TOP + 2.75
      const roof = new THREE.Mesh(new THREE.BoxGeometry(150, 24, 0.9), hall)
      roof.position.z = DECK_TOP + 6
      const concourse = new THREE.Mesh(new THREE.BoxGeometry(110, 22, 3.5), hall)
      concourse.position.z = 5.5
      g.add(body, roof, concourse)
      g.position.set(p[0], p[1], 0)
      g.rotation.z = Math.atan2(dir[1], dir[0])
      this.group.add(g)
    }
  }

  /** Move the trains to where the timetable says they are at `time` seconds */
  update(time: number) {
    let n = 0
    this.tracks.forEach((t) => {
      for (let k = 0; k < TRAINS_PER_TRACK; k++) {
        const head = positionAt(t, time + (k * t.cycle) / TRAINS_PER_TRACK)
        for (let c = 0; c < CAR.count; c++) {
          const s = head - (c + 0.5) * (CAR.length + CAR.gap)
          if (s < 0 || s > t.length) {
            this.cars.setMatrixAt(n++, this.m.makeScale(0, 0, 0))
            continue
          }
          const { p, dir } = at(t, s)
          this.q.setFromAxisAngle(this.up, Math.atan2(dir[1], dir[0]))
          this.cars.setMatrixAt(n++, this.m.compose(this.v.set(p[0], p[1], DECK_TOP), this.q, this.one))
        }
      }
    })
    this.cars.instanceMatrix.needsUpdate = true
  }

  /** Is any part of the line inside this frustum (worth animating)? */
  visibleIn(frustum: THREE.Frustum) {
    return this.tracks.length > 0 && frustum.intersectsSphere(this.bounds)
  }
}
