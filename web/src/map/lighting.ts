import type { LightSpecification, SkySpecification } from 'maplibre-gl'

export type LightMode = 'golden' | 'day' | 'night'

export interface Palette {
  background: string
  landuse: string
  park: string
  water: string
  waterLine: string
  roadCasing: string
  roadMinor: string
  roadSecondary: string
  roadPrimary: string
  roadMotorway: string
  rail: string
  metro: string
  /** colour stops by building height in metres */
  building: [number, string][]
  buildingSelected: string
  buildingHover: string
  areaFill: string
  areaLine: string
  areaSelected: string
  label: string
  labelHalo: string
  light: LightSpecification
  sky: SkySpecification
}

/**
 * Golden hour: low sun from the west-south-west, warm light raking across
 * the facades, an amber horizon and haze that thickens with distance.
 */
const golden: Palette = {
  background: '#ecd6b6',
  landuse: '#e6cda9',
  park: '#c4c38a',
  water: '#8fb0b3',
  waterLine: '#86a7ab',
  roadCasing: '#d4ae86',
  roadMinor: '#f7e7cf',
  roadSecondary: '#fbe0b6',
  roadPrimary: '#ffd08f',
  roadMotorway: '#ffb36b',
  rail: '#a98a6c',
  metro: '#d9542f',
  building: [
    [0, '#f7e1bf'],
    [12, '#f3d0a2'],
    [30, '#edbb88'],
    [70, '#e6a673'],
    [150, '#d98e60'],
  ],
  buildingSelected: '#ff7a3d',
  buildingHover: '#ffe0a8',
  areaFill: '#ffb35c',
  areaLine: '#b8672f',
  areaSelected: '#ff8a3d',
  label: '#5b3a22',
  labelHalo: '#fbe9d0',
  light: { anchor: 'map', position: [1.4, 250, 74], color: '#ffc98f', intensity: 0.75 },
  sky: {
    'sky-color': '#f0a35e',
    'horizon-color': '#ffe2b3',
    'fog-color': '#f4c896',
    'fog-ground-blend': 0.35,
    'horizon-fog-blend': 0.7,
    'sky-horizon-blend': 0.75,
    'atmosphere-blend': 0,
  },
}

const day: Palette = {
  background: '#eef0ea',
  landuse: '#e7e9e1',
  park: '#cfe0b4',
  water: '#9cc6de',
  waterLine: '#8dbad4',
  roadCasing: '#cfd2d6',
  roadMinor: '#ffffff',
  roadSecondary: '#ffffff',
  roadPrimary: '#fff4d1',
  roadMotorway: '#ffd98a',
  rail: '#a3a7ad',
  metro: '#d93a3a',
  building: [
    [0, '#ecebe7'],
    [12, '#e2e1dc'],
    [30, '#d4d6d8'],
    [70, '#c3cbd3'],
    [150, '#aebccb'],
  ],
  buildingSelected: '#ff7a3d',
  buildingHover: '#ffe2bd',
  areaFill: '#5a8dd6',
  areaLine: '#3c6db5',
  areaSelected: '#2f73e0',
  label: '#3a4048',
  labelHalo: '#ffffff',
  light: { anchor: 'map', position: [1.15, 210, 35], color: '#ffffff', intensity: 0.4 },
  sky: {
    'sky-color': '#7fb2e5',
    'horizon-color': '#dceaf6',
    'fog-color': '#e6eef4',
    'fog-ground-blend': 0.5,
    'horizon-fog-blend': 0.6,
    'sky-horizon-blend': 0.6,
    'atmosphere-blend': 0,
  },
}

const night: Palette = {
  background: '#1b2030',
  landuse: '#1f2536',
  park: '#1f2c2a',
  water: '#0f1a2b',
  waterLine: '#12203a',
  roadCasing: '#151a26',
  roadMinor: '#353d52',
  roadSecondary: '#5a5a5c',
  roadPrimary: '#b8853f',
  roadMotorway: '#f0a446',
  rail: '#4c5570',
  metro: '#ff6b4a',
  building: [
    [0, '#3d4660'],
    [12, '#465172'],
    [30, '#515e84'],
    [70, '#5f6f9a'],
    [150, '#7183b5'],
  ],
  buildingSelected: '#ffb35c',
  buildingHover: '#8fa3e0',
  areaFill: '#ffb35c',
  areaLine: '#f2a65a',
  areaSelected: '#ffb35c',
  label: '#e8dcc6',
  labelHalo: '#151a26',
  light: { anchor: 'map', position: [1.2, 120, 50], color: '#a9bcff', intensity: 0.45 },
  sky: {
    'sky-color': '#0a0f24',
    'horizon-color': '#2a3150',
    'fog-color': '#1d2236',
    'fog-ground-blend': 0.4,
    'horizon-fog-blend': 0.6,
    'sky-horizon-blend': 0.6,
    'atmosphere-blend': 0,
  },
}

export const PALETTES: Record<LightMode, Palette> = { golden, day, night }

export const LIGHT_MODE_LABELS: Record<LightMode, string> = {
  golden: 'Golden hour',
  day: 'Day',
  night: 'Night',
}
