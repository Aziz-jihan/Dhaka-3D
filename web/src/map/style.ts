import type {
  ExpressionSpecification,
  LayerSpecification,
  Map as MlMap,
  StyleSpecification,
} from 'maplibre-gl'
import type { Palette } from './lighting'

/** OpenFreeMap: free OpenMapTiles-schema vector tiles built from OpenStreetMap */
const OMT_TILEJSON = 'https://tiles.openfreemap.org/planet'
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
/** Our own building tileset (pipeline/06_build_tiles.py); set VITE_BUILDINGS_URL to serve it from a CDN */
const BUILDINGS_PMTILES = import.meta.env.VITE_BUILDINGS_URL ?? `${location.origin}/data/dhaka.pmtiles`

export const BUILDING_MIN_ZOOM = 13

const buildingColor = (p: Palette): ExpressionSpecification => [
  'case',
  ['boolean', ['feature-state', 'selected'], false], p.buildingSelected,
  ['boolean', ['feature-state', 'hover'], false], p.buildingHover,
  ['interpolate', ['linear'], ['get', 'h'], ...p.building.flat()],
] as ExpressionSpecification

const roadWidth = (base: number): ExpressionSpecification => [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  11, base * 0.4,
  14, base * 1.6,
  17, base * 6,
]

/**
 * Paint properties that change with the light mode, keyed by layer id.
 * The same table builds the initial style and re-colours it later.
 */
export function palettePaint(p: Palette): Record<string, Record<string, unknown>> {
  return {
    background: { 'background-color': p.background },
    landuse: { 'fill-color': p.landuse },
    park: { 'fill-color': p.park },
    'landcover-green': { 'fill-color': p.park },
    water: { 'fill-color': p.water },
    waterway: { 'line-color': p.waterLine },
    'area-fill': {
      'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], p.areaSelected, p.areaFill],
    },
    'area-line': { 'line-color': p.areaLine },
    'road-casing': { 'line-color': p.roadCasing },
    'road-minor': { 'line-color': p.roadMinor },
    'road-secondary': { 'line-color': p.roadSecondary },
    'road-primary': { 'line-color': p.roadPrimary },
    'road-motorway': { 'line-color': p.roadMotorway },
    rail: { 'line-color': p.rail },
    metro: { 'line-color': p.metro },
    'metro-glow': { 'line-color': p.metro },
    buildings: { 'fill-extrusion-color': buildingColor(p) },
    'road-label': { 'text-color': p.label, 'text-halo-color': p.labelHalo },
    'water-label': { 'text-color': p.label, 'text-halo-color': p.labelHalo },
  }
}

export function applyPalette(map: MlMap, p: Palette) {
  for (const [layer, props] of Object.entries(palettePaint(p))) {
    if (!map.getLayer(layer)) continue
    for (const [prop, value] of Object.entries(props)) map.setPaintProperty(layer, prop, value)
  }
  map.setLight(p.light)
  map.setSky(p.sky)
}

export function buildStyle(p: Palette): StyleSpecification {
  const paint = palettePaint(p)
  const roadClass = (classes: string[]): ExpressionSpecification =>
    ['match', ['get', 'class'], classes, true, false]

  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { ...paint.background } },
    {
      id: 'landuse', type: 'fill', source: 'omt', 'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['residential', 'commercial', 'industrial', 'retail'], true, false],
      paint: { ...paint.landuse, 'fill-opacity': 0.6 },
    },
    {
      id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park',
      paint: { ...paint.park, 'fill-opacity': 0.85 },
    },
    {
      id: 'landcover-green', type: 'fill', source: 'omt', 'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['grass', 'wood', 'farmland'], true, false],
      paint: { ...paint['landcover-green'], 'fill-opacity': 0.5 },
    },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { ...paint.water } },
    {
      id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway',
      paint: { ...paint.waterway, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 16, 3] },
    },
    {
      id: 'area-fill', type: 'fill', source: 'areas',
      paint: {
        ...paint['area-fill'],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.28, 0.06],
      },
    },
    {
      id: 'area-line', type: 'line', source: 'areas',
      layout: { 'line-join': 'round' },
      paint: {
        ...paint['area-line'],
        'line-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0.35],
        'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 1],
        'line-dasharray': [3, 2],
      },
    },
    {
      id: 'road-casing', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: roadClass(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { ...paint['road-casing'], 'line-width': roadWidth(2.4) },
    },
    {
      id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13,
      filter: roadClass(['minor', 'service', 'track']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { ...paint['road-minor'], 'line-width': roadWidth(0.9) },
    },
    {
      id: 'road-secondary', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: roadClass(['secondary', 'tertiary']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { ...paint['road-secondary'], 'line-width': roadWidth(1.6) },
    },
    {
      id: 'road-primary', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: roadClass(['primary', 'trunk']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { ...paint['road-primary'], 'line-width': roadWidth(2) },
    },
    {
      id: 'road-motorway', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: roadClass(['motorway']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { ...paint['road-motorway'], 'line-width': roadWidth(2.2) },
    },
    {
      id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation',
      filter: roadClass(['rail']),
      paint: { ...paint.rail, 'line-width': 1.2, 'line-dasharray': [2, 2] },
    },
    {
      id: 'metro-glow', type: 'line', source: 'metro',
      filter: ['==', ['get', 'kind'], 'track'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { ...paint['metro-glow'], 'line-width': 10, 'line-blur': 8, 'line-opacity': 0.35 },
    },
    {
      id: 'metro', type: 'line', source: 'metro',
      filter: ['==', ['get', 'kind'], 'track'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { ...paint.metro, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 5] },
    },
    {
      id: 'water-label', type: 'symbol', source: 'omt', 'source-layer': 'water_name',
      layout: { 'text-field': ['get', 'name:latin'], 'text-font': ['Noto Sans Italic'], 'text-size': 12 },
      paint: { ...paint['water-label'], 'text-halo-width': 1.2 },
    },
    {
      id: 'road-label', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 14,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name:latin']],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 14, 10, 17, 13],
      },
      paint: { ...paint['road-label'], 'text-halo-width': 1.4 },
    },
    {
      id: 'buildings', type: 'fill-extrusion', source: 'buildings', 'source-layer': 'buildings',
      minzoom: BUILDING_MIN_ZOOM,
      paint: {
        ...paint.buildings,
        // Rise out of the ground as you zoom in
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          BUILDING_MIN_ZOOM, 0,
          BUILDING_MIN_ZOOM + 0.6, ['get', 'h'],
        ],
        'fill-extrusion-base': ['get', 'b'],
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-vertical-gradient': true,
      },
    },
  ]

  return {
    version: 8,
    name: 'Dhaka 3D',
    glyphs: GLYPHS,
    sources: {
      omt: {
        type: 'vector',
        url: OMT_TILEJSON,
        attribution:
          '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
      },
      areas: { type: 'geojson', data: '/data/areas.geojson', promoteId: 'slug' },
      metro: { type: 'geojson', data: '/data/metro.geojson' },
      buildings: {
        type: 'vector',
        url: `pmtiles://${BUILDINGS_PMTILES}`,
        attribution:
          'Buildings: OSM, <a href="https://github.com/microsoft/GlobalMLBuildingFootprints" target="_blank">Microsoft</a>, heights <a href="https://human-settlement.emergency.copernicus.eu/" target="_blank">GHSL</a>',
      },
    },
    light: p.light,
    sky: p.sky,
    layers,
  }
}

/** Layer ids behind each user-facing layer toggle */
export const TOGGLE_LAYERS = {
  buildings: ['buildings'],
  areas: ['area-fill', 'area-line'],
  roads: ['road-casing', 'road-minor', 'road-secondary', 'road-primary', 'road-motorway', 'rail', 'road-label'],
  metro: ['metro', 'metro-glow'],
} as const
