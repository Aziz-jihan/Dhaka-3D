import { useEffect, useRef } from 'react'
import maplibregl, { type MapGeoJSONFeature } from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useApp } from '../store'
import { areaAt } from '../lib/geo'
import { DEFAULT_VIEW, DHAKA_BOUNDS, focusSelection } from './camera'
import { PALETTES } from './lighting'
import { CityMarkers } from './markers'
import { TOGGLE_LAYERS, applyPalette, buildStyle } from './style'

// Lets future self-hosted tiles use pmtiles:// URLs (see pipeline/README)
maplibregl.addProtocol('pmtiles', new Protocol().tile)

const INITIAL_HASH = location.hash
const BUILDING_SOURCE = { source: 'buildings', sourceLayer: 'buildings' }

export default function MapView() {
  const container = useRef<HTMLDivElement>(null)
  const markers = useRef<CityMarkers | null>(null)
  const data = useApp((s) => s.data)
  const map = useApp((s) => s.map)
  const lightMode = useApp((s) => s.lightMode)
  const lang = useApp((s) => s.lang)
  const layers = useApp((s) => s.layers)
  const selection = useApp((s) => s.selection)

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
    m.once('load', () => setTimeout(() => setReady(true), 3000))
    setMap(m)
    if (import.meta.env.DEV) Object.assign(window, { __map: m })
    return () => {
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

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['buildings'] })[0] as MapGeoJSONFeature | undefined
      if (hit && hit.id != null) {
        const p = hit.properties
        const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat]
        select({
          type: 'building',
          id: Number(hit.id),
          lngLat,
          height: Number(p.h),
          base: Number(p.b),
          src: Number(p.src),
          name: p.name as string | undefined,
          area: areaAt(lngLat, data.areas.features)?.properties.slug,
        })
        return
      }
      select(null)
    }

    let hovered: number | string | undefined
    const setHover = (id: number | string | undefined) => {
      if (hovered === id) return
      if (hovered != null) map.setFeatureState({ ...BUILDING_SOURCE, id: hovered }, { hover: false })
      if (id != null) map.setFeatureState({ ...BUILDING_SOURCE, id }, { hover: true })
      hovered = id
      map.getCanvas().style.cursor = id != null ? 'pointer' : ''
    }
    const onMove = (e: maplibregl.MapLayerMouseEvent) => setHover(e.features?.[0]?.id)
    const onLeave = () => setHover(undefined)
    map.on('click', onClick)
    map.on('mousemove', 'buildings', onMove)
    map.on('mouseleave', 'buildings', onLeave)

    // Deep link: ?place=<slug>
    const slug = new URLSearchParams(location.search).get('place')
    if (slug) {
      if (data.areas.features.some((f) => f.properties.slug === slug)) select({ type: 'area', slug })
      else if (data.landmarks.features.some((f) => f.properties.slug === slug)) select({ type: 'landmark', slug })
    }

    return () => {
      map.off('click', onClick)
      map.off('mousemove', 'buildings', onMove)
      map.off('mouseleave', 'buildings', onLeave)
      markers.current?.remove()
      markers.current = null
    }
  }, [map, data])

  // Lighting
  useEffect(() => {
    if (!map) return
    const apply = () => applyPalette(map, PALETTES[lightMode])
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [map, lightMode])

  useEffect(() => markers.current?.setLang(lang), [lang, data])

  // Layer toggles
  useEffect(() => {
    if (!map) return
    const apply = () => {
      for (const [key, ids] of Object.entries(TOGGLE_LAYERS)) {
        const visible = layers[key as keyof typeof TOGGLE_LAYERS] ? 'visible' : 'none'
        for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible)
      }
      markers.current?.setVisible('areas', layers.areas)
      markers.current?.setVisible('landmarks', layers.landmarks)
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [map, layers, data])

  // Selection: highlight, camera, URL
  const prevArea = useRef<string | null>(null)
  const prevBuilding = useRef<number | null>(null)
  useEffect(() => {
    if (!map || !data) return
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
