import { create } from 'zustand'
import type { Map as MlMap } from 'maplibre-gl'
import type { LightMode } from './map/lighting'
import type { CityData, Selection } from './types'

export type Lang = 'en' | 'bn'
export type LayerKey = 'buildings' | 'areas' | 'roads' | 'metro' | 'landmarks'
export type BuildingQuality = 'realistic' | 'simple'

export interface TourState {
  id: string
  step: number
  playing: boolean
}

interface AppState {
  map: MlMap | null
  data: CityData | null
  ready: boolean
  lightMode: LightMode
  lang: Lang
  selection: Selection | null
  layers: Record<LayerKey, boolean>
  buildingQuality: BuildingQuality
  tour: TourState | null
  panelOpen: boolean
  setMap: (map: MlMap | null) => void
  setData: (data: CityData) => void
  setReady: (ready: boolean) => void
  setLightMode: (mode: LightMode) => void
  setLang: (lang: Lang) => void
  select: (selection: Selection | null) => void
  toggleLayer: (key: LayerKey) => void
  setBuildingQuality: (quality: BuildingQuality) => void
  /** start a tour from its first stop, or change step/playing of the running one; null ends it */
  setTour: (tour: TourState | null) => void
  setPanelOpen: (open: boolean) => void
}

export const useApp = create<AppState>((set) => ({
  map: null,
  data: null,
  ready: false,
  lightMode: 'golden',
  lang: 'en',
  selection: null,
  layers: { buildings: true, areas: true, roads: true, metro: true, landmarks: true },
  buildingQuality: 'realistic',
  tour: null,
  panelOpen: true,
  setMap: (map) => set({ map }),
  setData: (data) => set({ data }),
  setReady: (ready) => set({ ready }),
  setLightMode: (lightMode) => set({ lightMode }),
  setLang: (lang) => set({ lang }),
  select: (selection) => set({ selection }),
  toggleLayer: (key) => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  setBuildingQuality: (buildingQuality) => set({ buildingQuality }),
  setTour: (tour) => set({ tour }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
}))
