/**
 * Low-poly models of Dhaka landmarks, built from primitives at real-world size.
 *
 * glTF conventions: metres, y up, -z north, origin at the centre of the
 * footprint on the ground. `scripts/export-landmarks.ts` writes each one to
 * `public/models/<slug>.glb`; a hand-made Blender model saved under the same
 * name replaces it with no code change.
 */
import * as THREE from 'three'

const mat = (color: string, roughness = 0.85, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness })

/** Box standing on y = base */
function box(w: number, h: number, d: number, m: THREE.Material, x = 0, base = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  mesh.position.set(x, base + h / 2, z)
  return mesh
}

/** Cylinder standing on y = base */
function cyl(r: number, h: number, m: THREE.Material, x = 0, base = 0, z = 0, segments = 24, rTop = r) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, segments), m)
  mesh.position.set(x, base + h / 2, z)
  return mesh
}

/** Half-sphere dome sitting on y = base, optionally stretched upwards */
function dome(r: number, m: THREE.Material, x = 0, base = 0, z = 0, stretch = 1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m)
  mesh.scale.y = stretch
  mesh.position.set(x, base, z)
  return mesh
}

function group(name: string, ...parts: THREE.Object3D[]) {
  const g = new THREE.Group()
  g.name = name
  g.add(...parts)
  return g
}

/** Central Shaheed Minar: white column frames on a stepped platform, red sun disc behind */
function shaheedMinar() {
  const white = mat('#f1efe9', 0.6)
  const stone = mat('#d6cfc1')
  const red = mat('#b3261e', 0.7)
  const parts: THREE.Object3D[] = [box(64, 1.2, 36, stone), box(52, 0.8, 28, stone, 0, 1.2)]
  const base = 2
  const frame = (x: number, h: number, w: number) => {
    const g = new THREE.Group()
    g.add(box(0.9, h, 0.8, white, -w / 2, base), box(0.9, h, 0.8, white, w / 2, base), box(w + 0.9, 0.8, 0.8, white, 0, base + h - 0.8))
    for (let i = 1; i < 4; i++) g.add(box(0.25, h - 0.8, 0.25, white, -w / 2 + (w * i) / 4, base))
    g.position.x = x
    return g
  }
  parts.push(frame(-13, 9, 4.5), frame(-7, 11, 5), frame(7, 11, 5), frame(13, 9, 4.5))
  // Central column with its top bowed forward, like a mother sheltering her children
  const centre = frame(0, 11, 7)
  const top = new THREE.Group()
  top.add(box(0.9, 5, 0.8, white, -3.5), box(0.9, 5, 0.8, white, 3.5), box(7.9, 0.8, 0.8, white, 0, 4.2))
  top.position.y = base + 11
  top.rotation.x = 0.55
  centre.add(top)
  parts.push(centre)
  const sun = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.4, 48), red)
  sun.rotation.x = Math.PI / 2
  sun.position.set(0, base + 9, -4)
  parts.push(sun)
  return group('shaheed-minar', ...parts)
}

/** Jatiya Sangsad Bhaban: octagonal assembly hall ringed by eight blocks with circular openings */
function sangsadBhaban() {
  const concrete = mat('#b9b2a4', 0.9)
  const marble = mat('#ece8df', 0.5)
  const hole = mat('#1d1d1f', 1)
  const parts: THREE.Object3D[] = [box(150, 1.5, 150, mat('#c9c2b3'))]
  parts.push(cyl(30, 47, concrete, 0, 1.5, 0, 8))
  for (let y = 6.5; y < 48; y += 5.2) parts.push(cyl(30.3, 0.35, marble, 0, y, 0, 8))
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const block = new THREE.Group()
    const tall = i % 2 === 0
    const h = tall ? 34 : 26
    block.add(box(24, h, 20, concrete, 0, 1.5))
    for (let y = 7; y < h; y += 5.2) block.add(box(24.4, 0.35, 20.4, marble, 0, y))
    // The signature cut-outs: a big circle on even blocks, a triangle-ish slot on odd ones
    const opening = new THREE.Mesh(
      tall ? new THREE.CircleGeometry(7.5, 40) : new THREE.CircleGeometry(6, 3),
      hole,
    )
    opening.position.set(0, 1.5 + h * 0.55, 10.05)
    block.add(opening)
    block.position.set(Math.sin(a) * 50, 0, Math.cos(a) * 50)
    block.rotation.y = a
    parts.push(block)
  }
  return group('sangsad-bhaban', ...parts)
}

/** Baitul Mukarram: white cube mosque on a broad podium */
function baitulMukarram() {
  const white = mat('#ece9e1', 0.6)
  const band = mat('#8d8a82', 0.8)
  const parts: THREE.Object3D[] = [box(100, 8, 80, mat('#e2dccd'), 0, 0, 6)]
  parts.push(box(40, 30, 40, white, 0, 8, -6))
  for (let y = 12; y < 37; y += 4.2) parts.push(box(40.4, 1.1, 40.4, band, 0, y, -6))
  parts.push(box(42, 1.2, 42, white, 0, 38, -6))
  return group('baitul-mukarram', ...parts)
}

/** Shapla Chattar: concrete water lily over a round fountain pool */
function shaplaChattar() {
  const white = mat('#f3f1ea', 0.55)
  const parts: THREE.Object3D[] = [cyl(13, 0.9, mat('#bdb5a6')), cyl(12.2, 0.2, mat('#4f8da3', 0.15), 0, 0.9)]
  parts.push(cyl(1.1, 4, white, 0, 0.9))
  const petals = (n: number, r: number, len: number, tilt: number, y: number, offset: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + offset
      const p = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), white)
      p.scale.set(2.2, 0.45, len)
      const holder = new THREE.Group()
      p.position.z = len * 0.8
      p.rotation.x = -tilt
      holder.add(p)
      holder.position.set(0, y, 0)
      holder.rotation.y = a
      holder.translateZ(r)
      parts.push(holder)
    }
  }
  petals(8, 0.8, 4.5, 0.45, 4.6, 0)
  petals(8, 0.4, 3.2, 0.95, 5.0, Math.PI / 8)
  return group('shapla-chattar', ...parts)
}

/** Lalbagh Fort: Pari Bibi's tomb with its central brass dome and corner turrets */
function lalbaghFort() {
  const stone = mat('#d2b48a', 0.85)
  const marble = mat('#efe7d8', 0.6)
  const brass = mat('#a9874c', 0.45, 0.4)
  const parts: THREE.Object3D[] = [box(30, 1.2, 30, mat('#b79a72')), box(20, 8, 20, stone, 0, 1.2)]
  parts.push(box(20.6, 0.8, 20.6, marble, 0, 9.2))
  parts.push(cyl(5.2, 3, stone, 0, 10, 0, 8), dome(5.4, brass, 0, 13, 0, 1.25))
  parts.push(cyl(0.25, 3, brass, 0, 19.5))
  for (const [x, z] of [[-9.5, -9.5], [9.5, -9.5], [-9.5, 9.5], [9.5, 9.5]]) {
    parts.push(cyl(1.4, 12, marble, x, 1.2, z, 8), dome(1.6, marble, x, 13.2, z, 1.3))
  }
  return group('lalbagh-fort', ...parts)
}

/** Ahsan Manzil: the pink Nawab palace with its tall central dome, facing the river (south) */
function ahsanManzil() {
  const pink = mat('#d98a98', 0.8)
  const white = mat('#f4efe8', 0.6)
  const parts: THREE.Object3D[] = [box(125, 1.5, 32, mat('#c9bba6'))]
  parts.push(box(120, 16, 26, pink, 0, 1.5))
  parts.push(box(121, 0.6, 27, white, 0, 9), box(122, 1, 28, white, 0, 17.5))
  // Projecting central portico and the grand stair down to the garden
  parts.push(box(22, 16, 10, pink, 0, 1.5, 17), box(23, 1, 11, white, 0, 17.5, 17))
  for (let i = 0; i < 6; i++) parts.push(box(26 - i * 1.5, 1.4, 4, white, 0, i * 1.4, 24 + (5 - i) * 2))
  parts.push(cyl(6.5, 5, pink, 0, 18.5, 4, 8), dome(7, mat('#c97888', 0.7), 0, 23.5, 4, 1.15))
  parts.push(cyl(0.5, 2.5, white, 0, 31.5, 4))
  return group('ahsan-manzil', ...parts)
}

/** Curzon Hall: red-brick hall with white bands and corner kiosks */
function curzonHall() {
  const brick = mat('#a4492f', 0.9)
  const white = mat('#efe3d0', 0.7)
  const parts: THREE.Object3D[] = [box(74, 13, 18, brick)]
  parts.push(box(74.4, 0.6, 18.4, white, 0, 6.3), box(75, 0.9, 19, white, 0, 13))
  parts.push(box(22, 18, 22, brick), box(22.6, 0.9, 22.6, white, 0, 18))
  for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
    parts.push(cyl(1.2, 3, white, x, 18.9, z, 8), dome(1.5, white, x, 21.9, z, 1.4))
  }
  parts.push(dome(5, white, 0, 18.9, 0, 1.2))
  return group('curzon-hall', ...parts)
}

/** Kamalapur station: rows of umbrella-shaped concrete shells on single columns */
function kamalapur() {
  const concrete = mat('#d8d2c5', 0.85)
  const glass = mat('#5f7378', 0.3)
  const parts: THREE.Object3D[] = [box(120, 8, 34, glass, 0, 0, 0)]
  const shell = new THREE.ConeGeometry(10.5, 3.2, 4, 1, true)
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 3; j++) {
      const x = -54 + i * 18
      const z = -18 + j * 18
      parts.push(cyl(0.7, 13, concrete, x, 0, z, 10))
      const umbrella = new THREE.Mesh(shell, concrete)
      umbrella.material.side = THREE.DoubleSide
      umbrella.rotation.set(Math.PI, Math.PI / 4, 0)
      umbrella.position.set(x, 14.6, z)
      parts.push(umbrella)
    }
  }
  return group('kamalapur', ...parts)
}

export interface LandmarkModel {
  slug: string
  build: () => THREE.Group
  /** degrees clockwise from north that the model's front (+z, south) is turned */
  bearing: number
  /** existing building footprints within this radius (m) are hidden */
  clearRadius: number
}

export const LANDMARK_MODELS: LandmarkModel[] = [
  { slug: 'shaheed-minar', build: shaheedMinar, bearing: 0, clearRadius: 32 },
  { slug: 'sangsad-bhaban', build: sangsadBhaban, bearing: 0, clearRadius: 85 },
  { slug: 'baitul-mukarram', build: baitulMukarram, bearing: 0, clearRadius: 48 },
  { slug: 'shapla-chattar', build: shaplaChattar, bearing: 0, clearRadius: 14 },
  { slug: 'lalbagh-fort', build: lalbaghFort, bearing: 0, clearRadius: 20 },
  { slug: 'ahsan-manzil', build: ahsanManzil, bearing: 0, clearRadius: 70 },
  { slug: 'curzon-hall', build: curzonHall, bearing: 0, clearRadius: 42 },
  { slug: 'kamalapur', build: kamalapur, bearing: 90, clearRadius: 70 },
]
