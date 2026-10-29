import type { CityData } from '../types'

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

export async function loadCityData(): Promise<CityData> {
  const [areas, landmarks, places] = await Promise.all([
    getJson<CityData['areas']>('/data/areas.geojson'),
    getJson<CityData['landmarks']>('/data/landmarks.geojson'),
    getJson<CityData['places']>('/data/places.json'),
  ])
  return { areas, landmarks, places }
}
