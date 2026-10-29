import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useApp } from '../store'
import { areaAt } from '../lib/geo'
import { BuildingLayer } from '../buildings/BuildingLayer'
import type { BuildingProps } from '../buildings/tileWorker'
import { DEFAULT_VIEW, DHAKA_BOUNDS, focusSelection } from './camera'
import { PALETTES } from './lighting'
import { CityMarkers } from './markers'
import { BUILDINGS_PMTILES, TOGGLE_LAYERS, applyPalette, buildStyle } from './style'

// MapLibre 6 looks for its worker next to its own module, which bundling moves; point it at the emitted file
maplibregl.setWorkerUrl(maplibreWorkerUrl)
// Lets future self-hosted tiles use pmtiles:// URLs (see pipeline/README)
maplibregl.addProtocol('pmtiles', new Protocol().tile)

const INITIAL_HASH = location.hash
const BUILDING_SOURCE = { source: 'buildings', sourceLayer: 'buildings' }
const LOW_POWER = window.matchMedia('(pointer: coarse)').matches

interface BuildingPick {
  id: number
  props: BuildingProps
  lngLat: [number, number]
}

export default function MapView() {
  const container = useRef<HTMLDivElement>(null)
  const markers = useRef<CityMarkers | null>(null)
  const data = useApp((s) => s.data)
  const map = useApp((s) => s.map)
  const lightMode = useApp((s) => s.lightMode)
  const lang = useApp((s) => s.lang)
  const layers = useApp((s) => s.layers)
  const selection = useApp((s) => s.selection)
  const quality = useApp((s) => s.buildingQuality)
  const buildings3d = useRef<BuildingLayer | null>(null)
  // True once the style has loaded. Not map.isStyleLoaded(): that turns false again
  // whenever tiles are loading, and the one-off 'load' event never fires twice.
  const [loaded, setLoaded] = useState(false)

  // Create the map once
  useEffect(() => {
    const { setMap, setReady, lightMode } = useApp.getState()
    // Map.remove() strips the camera hash; restore it so a remount (StrictMode) keeps a shared link
    if (!location.hash && INITIAL_HASH) history.replaceState(history.state, '', INITIAL_HASH)
    const m = new maplibregl.Map({
      container: container.current!,
      style: buildStyle(PALETTES[lightMode]),
      ...DEFAULT_VIEW,
      maxPitch: 78,
      maxBounds: DHAKA_BOUNDS,
      minZoom: 11,
      hash: 'map',
      canvasContextAttributes: { antialias: true },
      attributionControl: { compact: true },
    })
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    // Lift the loading screen once everything has drawn, or 3 s after the map loads
    // so a slow connection sees the city fill in rather than a waiting screen
    m.once('idle', () => setReady(true))
    m.once('load', () => {
      setLoaded(true)
      setTimeout(() => setReady(true), 3000)
    })
    setMap(m)
    if (import.meta.env.DEV) Object.assign(window, { __map: m })
    return () => {
      setLoaded(false)
      buildings3d.current = null
      setMap(null)
      m.remove()
    }
  }, [])

  // Markers and click handling need the city data
  useEffect(() => {
    if (!map || !data) return
    const { select } = useApp.getState()
    markers.current = new CityMarkers(map, data, select)
    markers.current.setLang(useApp.getState().lang)

    // Realistic buildings are ray-cast in three.js; simple ones are MapLibre features
    const pickBuilding = (point: maplibregl.Point): BuildingPick | null => {
      if (buildings3d.current) return buildings3d.current.pick(point)
      const f = map.queryRenderedFeatures(point, { layers: ['buildings'] })[0]
      if (!f || f.id == null) return null
      const { lng, lat } = map.unproject(point)
      const p = f.properties
      return {
        id: Number(f.id),
        props: { h: Number(p.h), b: Number(p.b), src: Number(p.src), name: p.name as string | undefined },
        lngLat: [lng, lat],
      }
    }

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const hit = pickBuilding(e.point)
      if (!hit) {
        select(null)
        return
      }
      select({
        type: 'building',
        id: hit.id,
        lngLat: hit.lngLat,
        height: hit.props.h,
        base: hit.props.b,
        src: hit.props.src,
        name: hit.props.name,
        area: areaAt(hit.lngLat, data.areas.features)?.properties.slug,
      })
    }

    let hovered: number | null = null
    const setHover = (id: number | null) => {
      if (hovered === id) return
      if (hovered != null) map.setFeatureState({ ...BUILDING_SOURCE, id: hovered }, { hover: false })
      if (id != null) map.setFeatureState({ ...BUILDING_SOURCE, id }, { hover: true })
      buildings3d.current?.setHover(id)
      hovered = id
      map.getCanvas().style.cursor = id != null ? 'pointer' : ''
    }
    // Ray-casting on every mousemove event is wasteful; once per frame is plenty
    let pending: maplibregl.Point | null = null
    const onMove = (e: maplibregl.MapMouseEvent) => {
      if (!pending)
        requestAnimationFrame(() => {
          if (pending) setHover(pickBuilding(pending)?.id ?? null)
          pending = null
        })
      pending = e.point
    }
    const onLeave = () => {
      pending = null
      setHover(null)
    }
    map.on('click', onClick)
    map.on('mousemove', onMove)
    map.on('mouseout', onLeave)

    // Deep link: ?place=<slug>
    const slug = new URLSearchParams(location.search).get('place')
    if (slug) {
      if (data.areas.features.some((f) => f.properties.slug === slug)) select({ type: 'area', slug })
      else if (data.landmarks.features.some((f) => f.properties.slug === slug)) select({ type: 'landmark', slug })
    }

    return () => {
      map.off('click', onClick)
      map.off('mousemove', onMove)
      map.off('mouseout', onLeave)
      markers.current?.remove()
      markers.current = null
    }
  }, [map, data])

  // Lighting
  useEffect(() => {
    if (!map?.style || !loaded) return
    applyPalette(map, PALETTES[lightMode])
    buildings3d.current?.setLighting(PALETTES[lightMode])
  }, [map, loaded, lightMode])

  // Realistic (three.js) or simple (MapLibre extrusion) buildings
  useEffect(() => {
    if (!map || !loaded) return
    if (quality === 'realistic' && !buildings3d.current) {
      const layer = new BuildingLayer({ url: BUILDINGS_PMTILES, lowPower: LOW_POWER })
      const { lightMode, selection, layers } = useApp.getState()
      layer.setLighting(PALETTES[lightMode])
      layer.setSelected(selection?.type === 'building' ? selection.id : null)
      map.addLayer(layer)
      if (!layers.buildings) map.setLayoutProperty(layer.id, 'visibility', 'none')
      buildings3d.current = layer
    } else if (quality === 'simple' && buildings3d.current) {
      map.removeLayer(buildings3d.current.id)
      buildings3d.current = null
    }
    const showSimple = quality === 'simple' && useApp.getState().layers.buildings
    map.setLayoutProperty('buildings', 'visibility', showSimple ? 'visible' : 'none')
  }, [map, loaded, quality])

  useEffect(() => markers.current?.setLang(lang), [lang, data])

  // Layer toggles
  useEffect(() => {
    if (!map || !loaded) return
    for (const [key, ids] of Object.entries(TOGGLE_LAYERS)) {
      const visible = layers[key as keyof typeof TOGGLE_LAYERS] ? 'visible' : 'none'
      for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible)
    }
    const realistic = useApp.getState().buildingQuality === 'realistic'
    const vis = (on: boolean) => (on ? 'visible' : 'none')
    map.setLayoutProperty('buildings', 'visibility', vis(layers.buildings && !realistic))
    if (map.getLayer('buildings-3d')) map.setLayoutProperty('buildings-3d', 'visibility', vis(layers.buildings && realistic))
    markers.current?.setVisible('areas', layers.areas)
    markers.current?.setVisible('landmarks', layers.landmarks)
  }, [map, loaded, layers, data])

  // Selection: highlight, camera, URL
  const prevArea = useRef<string | null>(null)
  const prevBuilding = useRef<number | null>(null)
  useEffect(() => {
    // A hot-reload can run this once against the map that was just removed (no style left)
    if (!map?.style || !data) return
    markers.current?.setSelected(selection)

    const areaSlug = selection?.type === 'area' ? selection.slug : null
    if (map.getSource('areas')) {
      if (prevArea.current) map.setFeatureState({ source: 'areas', id: prevArea.current }, { selected: false })
      if (areaSlug) map.setFeatureState({ source: 'areas', id: areaSlug }, { selected: true })
    }
    prevArea.current = areaSlug

    const buildingId = selection?.type === 'building' ? selection.id : null
    if (map.getSource(BUILDING_SOURCE.source)) {
      if (prevBuilding.current != null)
        map.setFeatureState({ ...BUILDING_SOURCE, id: prevBuilding.current }, { selected: false })
      if (buildingId != null) map.setFeatureState({ ...BUILDING_SOURCE, id: buildingId }, { selected: true })
    }
    prevBuilding.current = buildingId
    buildings3d.current?.setSelected(buildingId)
    if (selection) focusSelection(map, data, selection)

    const url = new URL(location.href)
    const slug = selection?.type === 'area' || selection?.type === 'landmark' ? selection.slug : null
    if (slug) url.searchParams.set('place', slug)
    else url.searchParams.delete('place')
    history.replaceState(history.state, '', url)
  }, [map, data, selection])

  // Inline style: maplibre-gl.css sets `position: relative` on the container, which beats a utility class
  return <div ref={container} style={{ position: 'absolute', inset: 0 }} />
}
