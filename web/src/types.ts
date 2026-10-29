import type { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from 'geojson'

export interface AreaProps {
  slug: string
  name_en: string
  name_bn: string
  zone: string
  featured: boolean
  center: [number, number]
  source: 'osm' | 'manual'
}

export interface LandmarkProps {
  slug: string
  name_en: string
  name_bn: string
  kind: string
  blurb: string
  wiki: string
  source: 'osm' | 'manual'
}

export type AreaFeature = Feature<Polygon | MultiPolygon, AreaProps>
export type LandmarkFeature = Feature<Point, LandmarkProps>

export interface Place {
  type: 'area' | 'landmark' | 'road' | 'station'
  id: string
  name: string
  name_bn: string
  center: [number, number]
  bounds?: [number, number, number, number]
}

export interface CityData {
  areas: FeatureCollection<Polygon | MultiPolygon, AreaProps>
  landmarks: FeatureCollection<Point, LandmarkProps>
  places: Place[]
}

export type Selection =
  | { type: 'area'; slug: string }
  | { type: 'landmark'; slug: string }
  | {
      type: 'building'
      id: number
      lngLat: [number, number]
      height: number
      base: number
      /** height source code, see pipeline/03_heights.py */
      src: number
      name?: string
      area?: string
    }
  | { type: 'place'; place: Place }
