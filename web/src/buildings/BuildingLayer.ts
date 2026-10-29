/**
 * Realistic buildings: a MapLibre custom layer that draws the building
 * tileset with three.js, sharing the map's WebGL context, depth buffer and
 * camera. Adds sun shadows (on buildings and streets), a procedural facade,
 * glTF landmark models and the elevated Metro Line 6 with moving trains.
 */
import * as THREE from 'three'
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MlMap } from 'maplibre-gl'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { LANDMARK_MODELS } from '../landmarks/models'
import type { Palette } from '../map/lighting'
import type { CityData } from '../types'
import type { MeshArrays } from './geometry'
import { createFacadeMaterial, srgb, type FacadeUniforms } from './material'
import { MetroLine } from './metro'
import type { BuildingProps, ClearZone, Origin, WorkerRequest, WorkerResponse } from './tileWorker'

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast

/** Local coordinate origin, roughly the middle of the tileset */
const ORIGIN_LNGLAT: [number, number] = [90.4, 23.775]
const MIN_ZOOM = 13
const MAX_ZOOM = 16
/** Rooftop stair rooms and tanks only on close-up tiles */
const CLUTTER_MIN_ZOOM = 15
const CACHE_TILES = 240
const MAX_IN_FLIGHT = 12
const SHADOW_HALF_M = 1300
/** Trains animate every frame when this close; further out a few updates a second is plenty */
const SMOOTH_TRAINS_ZOOM = 14.5

type TileState = 'loading' | 'ready' | 'empty' | 'error'

interface Tile {
  key: string
  z: number
  x: number
  y: number
  state: TileState
  mesh: THREE.Mesh | null
  props: Map<number, BuildingProps>
  lastUsed: number
}

export type LayerHit =
  | { kind: 'building'; id: number; props: BuildingProps; lngLat: [number, number] }
  | { kind: 'landmark'; slug: string }

export interface BuildingLayerOptions {
  url: string
  /** phones: bigger tiles and a smaller shadow map */
  lowPower: boolean
  /** landmark positions and the metro line */
  city: Pick<CityData, 'landmarks' | 'metro'>
}

const tileKey = (z: number, x: number, y: number) => `${z}/${x}/${y}`

export class BuildingLayer implements CustomLayerInterface {
  readonly id = 'buildings-3d'
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private map!: MlMap
  private renderer!: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.Camera()
  private readonly group = new THREE.Group()
  private readonly sun = new THREE.DirectionalLight()
  private readonly ambient = new THREE.HemisphereLight()
  private readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>
  private readonly material: THREE.MeshStandardMaterial
  private readonly uniforms: FacadeUniforms
  private readonly origin: Origin
  /** local metres -> Web Mercator */
  private readonly model = new THREE.Matrix4()
  /** local metres -> clip space, from the last frame */
  private readonly viewProj = new THREE.Matrix4()
  private readonly viewProjInverse = new THREE.Matrix4()
  private readonly eye = new THREE.Vector4()
  private readonly sunDir = new THREE.Vector3(0, 0, 1)
  private readonly tiles = new Map<string, Tile>()
  private readonly queue: Tile[] = []
  private readonly workers: Worker[] = []
  private nextWorker = 0
  private inFlight = 0
  private frame = 0
  private readonly raycaster = new THREE.Raycaster()
  private readonly landmarks = new THREE.Group()
  private readonly clear: ClearZone[] = []
  private readonly metro: MetroLine
  private readonly frustum = new THREE.Frustum()
  private readonly frustumMatrix = new THREE.Matrix4()
  private trainTimer = 0

  constructor(private readonly options: BuildingLayerOptions) {
    const o = MercatorCoordinate.fromLngLat(ORIGIN_LNGLAT)
    const s = o.meterInMercatorCoordinateUnits()
    this.origin = { x: o.x, y: o.y, scale: s }
    this.model.makeTranslation(o.x, o.y, 0).scale(new THREE.Vector3(s, -s, s))

    const { material, uniforms } = createFacadeMaterial()
    this.material = material
    this.uniforms = uniforms

    this.sun.castShadow = true
    const size = options.lowPower ? 2048 : 4096
    this.sun.shadow.mapSize.set(size, size)
    const cam = this.sun.shadow.camera
    cam.left = cam.bottom = -SHADOW_HALF_M
    cam.right = cam.top = SHADOW_HALF_M
    cam.near = 10
    cam.far = 8000
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.6

    // Catches building shadows on the streets; draws nothing else
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(SHADOW_HALF_M * 2, SHADOW_HALF_M * 2),
      new THREE.ShadowMaterial({ opacity: 0.4, depthWrite: false }),
    )
    this.ground.receiveShadow = true
    this.ground.position.z = 0.05

    this.raycaster.firstHitOnly = true
    this.metro = new MetroLine(options.city.metro, (lng, lat) => this.toLocal(lng, lat))
    this.placeLandmarks()
    this.scene.add(this.group, this.landmarks, this.metro.group, this.sun, this.sun.target, this.ambient, this.ground)
  }

  /** lng/lat -> local metres */
  private toLocal(lng: number, lat: number): [number, number] {
    const m = MercatorCoordinate.fromLngLat([lng, lat])
    return [(m.x - this.origin.x) / this.origin.scale, -(m.y - this.origin.y) / this.origin.scale]
  }

  /** Load each landmark's glTF model where the landmark stands, and clear the footprints under it */
  private placeLandmarks() {
    const loader = new GLTFLoader()
    for (const model of LANDMARK_MODELS) {
      const f = this.options.city.landmarks.features.find((l) => l.properties.slug === model.slug)
      if (!f) continue
      const [x, y] = this.toLocal(f.geometry.coordinates[0], f.geometry.coordinates[1])
      this.clear.push({ x, y, r: model.clearRadius })
      loader.load(`/models/${model.slug}.glb`, (gltf) => {
        const holder = new THREE.Group()
        // glTF is y-up with -z north; this scene is z-up with +y north
        gltf.scene.rotation.x = Math.PI / 2
        holder.add(gltf.scene)
        holder.position.set(x, y, 0)
        holder.rotation.z = -THREE.MathUtils.degToRad(model.bearing)
        holder.traverse((o) => {
          o.castShadow = true
          o.receiveShadow = true
          o.userData.landmark = model.slug
        })
        this.landmarks.add(holder)
        this.map?.triggerRepaint()
      })
    }
  }

  setMetroVisible(visible: boolean) {
    this.metro.group.visible = visible
    this.map?.triggerRepaint()
  }

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
    this.renderer.autoClear = false
    this.renderer.setPixelRatio(1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const workers = Math.min(4, Math.max(2, (navigator.hardwareConcurrency || 4) - 2))
    for (let i = 0; i < workers; i++) {
      const w = new Worker(new URL('./tileWorker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<WorkerResponse>) => this.onTile(e.data)
      w.postMessage({ type: 'init', url: this.options.url, origin: this.origin, clear: this.clear } satisfies WorkerRequest)
      this.workers.push(w)
    }
  }

  onRemove() {
    for (const w of this.workers) w.terminate()
    clearTimeout(this.trainTimer)
    for (const t of this.tiles.values()) this.disposeTile(t)
    this.tiles.clear()
    this.material.dispose()
    this.ground.geometry.dispose()
    this.ground.material.dispose()
    this.renderer.dispose()
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    this.frame++
    // mainMatrix takes Web Mercator 0..1 coordinates (modelViewProjectionMatrix uses world pixels)
    this.viewProj.fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(this.model)

    // Put the three.js camera at the real eye position so specular light and
    // haze are computed from the right place: projection' = viewProj * eye.
    // The eye is the point viewProj sends to clip (0, 0, c, 0), so it falls out of the inverse
    // (map.transform, which MapLibre 5 exposed for this, is internal in 6)
    this.eye.set(0, 0, 1, 0).applyMatrix4(this.viewProjInverse.copy(this.viewProj).invert())
    this.camera.position.set(this.eye.x, this.eye.y, this.eye.z).divideScalar(this.eye.w)
    this.camera.updateMatrixWorld()
    this.camera.projectionMatrix.copy(this.viewProj).multiply(this.camera.matrixWorld)
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert()

    this.updateTiles()
    this.followShadow()
    const animating = this.animateTrains()

    this.renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)

    // Keep the trains moving: every frame up close, a few times a second from afar
    if (animating && !this.trainTimer) {
      if (this.map.getZoom() >= SMOOTH_TRAINS_ZOOM) this.map.triggerRepaint()
      else
        this.trainTimer = window.setTimeout(() => {
          this.trainTimer = 0
          this.map.triggerRepaint()
        }, 250)
    }
  }

  /** Move trains to their timetable position; true if the line could be on screen */
  private animateTrains() {
    if (!this.metro.group.visible) return false
    this.frustumMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.frustumMatrix)
    if (!this.metro.visibleIn(this.frustum)) return false
    this.metro.update(performance.now() / 1000)
    return true
  }

  setLighting(p: Palette) {
    const b = p.buildings3d
    const az = THREE.MathUtils.degToRad(b.sun.azimuth)
    const alt = THREE.MathUtils.degToRad(b.sun.altitude)
    this.sunDir.set(Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt))
    this.sun.color.set(b.sun.color)
    this.sun.intensity = b.sun.intensity
    this.ambient.color.set(b.ambient.sky)
    this.ambient.groundColor.set(b.ambient.ground)
    this.ambient.intensity = b.ambient.intensity
    // Hemisphere light assumes y is up; ours is z
    this.ambient.position.set(0, 0, 1)
    this.ground.material.opacity = b.shadow
    this.uniforms.uNight.value = b.night
    this.uniforms.uSky.value = srgb(b.reflection)
    this.uniforms.uFog.value = srgb(b.haze)
    this.uniforms.uFogMax.value = b.hazeMax
    this.map?.triggerRepaint()
  }

  setHover(id: number | null) {
    this.uniforms.uHover.value = id ?? -1
    this.map?.triggerRepaint()
  }

  setSelected(id: number | null) {
    this.uniforms.uSelected.value = id ?? -1
    this.map?.triggerRepaint()
  }

  /** Building or landmark model under a screen point (CSS pixels), using the last rendered frame */
  pick(point: { x: number; y: number }): LayerHit | null {
    const canvas = this.map.getCanvas()
    const inv = this.viewProj.clone().invert()
    const ndcX = (point.x / canvas.clientWidth) * 2 - 1
    const ndcY = -(point.y / canvas.clientHeight) * 2 + 1
    const near = new THREE.Vector3(ndcX, ndcY, -1).applyMatrix4(inv)
    const far = new THREE.Vector3(ndcX, ndcY, 1).applyMatrix4(inv)
    this.raycaster.ray.set(near, far.sub(near).normalize())

    const meshes: THREE.Mesh[] = []
    const owner = new Map<THREE.Object3D, Tile>()
    for (const t of this.tiles.values()) {
      if (t.mesh?.visible) {
        meshes.push(t.mesh)
        owner.set(t.mesh, t)
      }
    }
    const hit = this.raycaster.intersectObjects(meshes, false)[0]
    const mark = this.raycaster.intersectObject(this.landmarks, true)[0]
    if (mark && (!hit || mark.distance < hit.distance)) return { kind: 'landmark', slug: mark.object.userData.landmark }
    if (!hit?.face) return null
    const geom = (hit.object as THREE.Mesh).geometry
    const id = Math.round(geom.getAttribute('aBld').getX(hit.face.a))
    const props = owner.get(hit.object)?.props.get(id)
    if (!props) return null
    const { x, y, scale } = this.origin
    const lngLat = new MercatorCoordinate(x + hit.point.x * scale, y - hit.point.y * scale).toLngLat()
    return { kind: 'building', id, props, lngLat: [lngLat.lng, lngLat.lat] }
  }

  /** Choose the tiles for this view, request missing ones, show the best available */
  private updateTiles() {
    const wanted = this.map.coveringTiles({
      tileSize: this.options.lowPower ? 512 : 256,
      minzoom: MIN_ZOOM,
      maxzoom: MAX_ZOOM,
    })
    const show = new Set<Tile>()
    const fallbacks = new Set<Tile>()
    for (const id of wanted) {
      const { z, x, y } = id.canonical
      const t = this.getTile(z, x, y)
      t.lastUsed = this.frame
      if (t.state === 'ready') {
        show.add(t)
        continue
      }
      if (t.state === 'loading') {
        // Until it arrives, show the nearest loaded ancestor (lower detail, same area)
        for (let pz = z - 1, px = x >> 1, py = y >> 1; pz >= MIN_ZOOM; pz--, px >>= 1, py >>= 1) {
          const parent = this.tiles.get(tileKey(pz, px, py))
          if (parent?.state === 'ready') {
            parent.lastUsed = this.frame
            fallbacks.add(parent)
            break
          }
        }
      }
    }
    // A tile covered by a fallback ancestor would draw its buildings twice
    for (const t of show) {
      for (let pz = t.z - 1, px = t.x >> 1, py = t.y >> 1; pz >= MIN_ZOOM; pz--, px >>= 1, py >>= 1) {
        const parent = this.tiles.get(tileKey(pz, px, py))
        if (parent && fallbacks.has(parent)) show.delete(t)
      }
    }
    for (const t of fallbacks) show.add(t)
    for (const t of this.tiles.values()) if (t.mesh) t.mesh.visible = show.has(t)

    this.pump()
    this.evict()
  }

  private getTile(z: number, x: number, y: number): Tile {
    const key = tileKey(z, x, y)
    let t = this.tiles.get(key)
    if (!t) {
      t = { key, z, x, y, state: 'loading', mesh: null, props: new Map(), lastUsed: this.frame }
      this.tiles.set(key, t)
      this.queue.push(t)
    }
    return t
  }

  /** Send queued requests to the workers, nearest-to-view first */
  private pump() {
    this.queue.sort((a, b) => b.lastUsed - a.lastUsed)
    while (this.inFlight < MAX_IN_FLIGHT && this.queue.length) {
      const t = this.queue.shift()!
      if (t.lastUsed < this.frame - 1) {
        // Scrolled out of view before it was requested
        this.tiles.delete(t.key)
        continue
      }
      this.inFlight++
      const w = this.workers[this.nextWorker++ % this.workers.length]
      w.postMessage({ type: 'tile', key: t.key, z: t.z, x: t.x, y: t.y, clutter: t.z >= CLUTTER_MIN_ZOOM } satisfies WorkerRequest)
    }
  }

  private onTile(msg: WorkerResponse) {
    this.inFlight--
    const t = this.tiles.get(msg.key)
    if (!t) return
    if (msg.type === 'error') {
      console.warn(`building tile ${msg.key}: ${msg.message}`)
      t.state = 'error'
    } else if (!msg.mesh || msg.mesh.index.length === 0) {
      t.state = 'empty'
    } else {
      t.mesh = this.createMesh(msg.mesh)
      t.props = new Map(msg.props)
      t.state = 'ready'
      this.group.add(t.mesh)
    }
    this.map.triggerRepaint()
  }

  private createMesh(a: MeshArrays): THREE.Mesh {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(a.position, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 4, true))
    g.setAttribute('aWall', new THREE.BufferAttribute(a.wall, 2))
    g.setAttribute('aBld', new THREE.BufferAttribute(a.bld, 3))
    g.setIndex(new THREE.BufferAttribute(a.index, 1))
    g.computeBoundingSphere()
    g.computeBoundsTree()
    const mesh = new THREE.Mesh(g, this.material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.matrixAutoUpdate = false
    mesh.visible = false
    return mesh
  }

  private evict() {
    if (this.tiles.size <= CACHE_TILES) return
    const old = [...this.tiles.values()]
      .filter((t) => t.state !== 'loading' && t.lastUsed < this.frame)
      .sort((a, b) => a.lastUsed - b.lastUsed)
    for (const t of old.slice(0, this.tiles.size - CACHE_TILES)) {
      this.disposeTile(t)
      this.tiles.delete(t.key)
    }
  }

  private disposeTile(t: Tile) {
    if (!t.mesh) return
    this.group.remove(t.mesh)
    t.mesh.geometry.disposeBoundsTree()
    t.mesh.geometry.dispose()
    t.mesh = null
  }

  /** Keep the sun's shadow box centred on what the camera is looking at */
  private followShadow() {
    const c = MercatorCoordinate.fromLngLat(this.map.getCenter())
    const { x, y, scale } = this.origin
    // Snap to whole metres so shadows don't shimmer while panning
    const tx = Math.round((c.x - x) / scale)
    const ty = Math.round(-(c.y - y) / scale)
    this.sun.target.position.set(tx, ty, 0)
    this.sun.position.set(tx, ty, 0).addScaledVector(this.sunDir, 3000)
    this.sun.target.updateMatrixWorld()
    this.ground.position.set(tx, ty, 0.05)
  }
}
