/**
 * Guided tours: camera stops with a caption. A stop points at a landmark or
 * area by slug (its position comes from the city data) or at a coordinate.
 */
import type { CityData } from '../types'

type Target = { landmark: string } | { area: string } | { lngLat: [number, number] }

export interface TourStop {
  at: Target
  title: string
  text: string
  zoom: number
  pitch: number
  /** camera heading; 'next' looks towards the following stop (used along the metro) */
  bearing: number | 'next'
}

export interface Tour {
  id: string
  title: string
  blurb: string
  stops: TourStop[]
}

export const TOURS: Tour[] = [
  {
    id: 'old-dhaka',
    title: 'Old Dhaka heritage',
    blurb: 'River port, Nawab palace, Mughal fort and the Language Movement memorial.',
    stops: [
      {
        at: { landmark: 'sadarghat-terminal' },
        title: 'Sadarghat',
        text: 'Launches leave the Buriganga from here for the south of the country. The river front has been the city’s gateway for centuries.',
        zoom: 16.2, pitch: 64, bearing: 15,
      },
      {
        at: { landmark: 'ahsan-manzil' },
        title: 'Ahsan Manzil',
        text: 'The pink palace of the Nawabs of Dhaka, facing the river. It is now a museum.',
        zoom: 17.2, pitch: 62, bearing: 340,
      },
      {
        at: { area: 'armanitola' },
        title: 'Armanitola',
        text: 'One of Old Dhaka’s oldest quarters, named after the Armenian merchants who settled here. Dense, low brick streets.',
        zoom: 16.4, pitch: 66, bearing: 60,
      },
      {
        at: { landmark: 'lalbagh-fort' },
        title: 'Lalbagh Fort',
        text: 'A 17th-century Mughal fort that was never finished. The tomb of Pari Bibi stands at its centre.',
        zoom: 17.3, pitch: 60, bearing: 20,
      },
      {
        at: { landmark: 'curzon-hall' },
        title: 'Curzon Hall',
        text: 'Red-brick hall from 1904 that mixes Mughal and European styles, now part of Dhaka University.',
        zoom: 17.2, pitch: 60, bearing: 200,
      },
      {
        at: { landmark: 'shaheed-minar' },
        title: 'Central Shaheed Minar',
        text: 'Honours those killed on 21 February 1952 demanding Bangla as a state language, the day now marked as International Mother Language Day.',
        zoom: 17.6, pitch: 58, bearing: 180,
      },
    ],
  },
  {
    id: 'motijheel',
    title: 'Motijheel business district',
    blurb: 'Banks, the national mosque, the stadium and the main railway station.',
    stops: [
      {
        at: { landmark: 'shapla-chattar' },
        title: 'Shapla Chattar',
        text: 'The concrete water lily, Bangladesh’s national flower, at the heart of the commercial district.',
        zoom: 17.4, pitch: 62, bearing: 30,
      },
      {
        at: { landmark: 'bangladesh-bank' },
        title: 'Bangladesh Bank',
        text: 'Headquarters of the central bank. Its annex towers are among the tallest buildings in Motijheel.',
        zoom: 16.6, pitch: 68, bearing: 300,
      },
      {
        at: { landmark: 'baitul-mukarram' },
        title: 'Baitul Mukarram',
        text: 'The national mosque. Its plain cube form recalls the Kaaba in Mecca.',
        zoom: 17, pitch: 60, bearing: 20,
      },
      {
        at: { landmark: 'national-stadium' },
        title: 'National Stadium',
        text: 'Dhaka’s main stadium for football and athletics, next to the mosque in Paltan.',
        zoom: 16.6, pitch: 60, bearing: 120,
      },
      {
        at: { landmark: 'kamalapur' },
        title: 'Kamalapur Railway Station',
        text: 'The city’s main railway terminus, known for its roof of umbrella-shaped concrete shells.',
        zoom: 16.8, pitch: 62, bearing: 250,
      },
    ],
  },
  {
    id: 'metro',
    title: 'Ride Metro Line 6',
    blurb: 'Follow Dhaka’s elevated metro from Mirpur to Motijheel.',
    stops: [
      {
        at: { lngLat: [90.368261, 23.808365] },
        title: 'Mirpur 10',
        text: 'MRT Line 6, the city’s first metro, runs on a viaduct above the streets. Watch for trains pulling into the stations.',
        zoom: 16, pitch: 66, bearing: 'next',
      },
      {
        at: { lngLat: [90.38005, 23.778427] },
        title: 'Agargaon',
        text: 'Government offices, the Planning Commission and the National Science Museum are close by.',
        zoom: 16, pitch: 66, bearing: 'next',
      },
      {
        at: { lngLat: [90.387111, 23.759039] },
        title: 'Farmgate',
        text: 'One of the busiest junctions in the city, where Mirpur Road meets the airport road corridor.',
        zoom: 16.2, pitch: 66, bearing: 'next',
      },
      {
        at: { lngLat: [90.392776, 23.751266] },
        title: 'Karwan Bazar',
        text: 'The city’s great wholesale market, surrounded by newspaper offices and high-rises.',
        zoom: 16.2, pitch: 66, bearing: 'next',
      },
      {
        at: { lngLat: [90.395985, 23.739465] },
        title: 'Shahbag',
        text: 'Hospitals, the National Museum and the public library meet at this crossroads.',
        zoom: 16.4, pitch: 64, bearing: 'next',
      },
      {
        at: { lngLat: [90.396823, 23.731683] },
        title: 'Dhaka University',
        text: 'The line passes the campus, TSC and Suhrawardy Udyan.',
        zoom: 16.4, pitch: 64, bearing: 'next',
      },
      {
        at: { lngLat: [90.419055, 23.728059] },
        title: 'Motijheel',
        text: 'The southern terminus for most trains, in the middle of the business district.',
        zoom: 16.4, pitch: 64, bearing: 90,
      },
    ],
  },
  {
    id: 'parliament-gulshan',
    title: 'Parliament to Gulshan',
    blurb: 'Louis Kahn’s parliament, the Hatirjheel loop and the lakes of Gulshan.',
    stops: [
      {
        at: { landmark: 'sangsad-bhaban' },
        title: 'Jatiya Sangsad Bhaban',
        text: 'The national parliament, designed by Louis Kahn and completed in 1982.',
        zoom: 16.8, pitch: 58, bearing: 20,
      },
      {
        at: { landmark: 'hatirjheel' },
        title: 'Hatirjheel',
        text: 'A lake and road loop through the middle of the city, with bridges and walkways along the water.',
        zoom: 15.4, pitch: 62, bearing: 40,
      },
      {
        at: { landmark: 'gulshan-lake-park' },
        title: 'Gulshan Lake',
        text: 'The lake between Gulshan and Baridhara, lined with a park and walking trail.',
        zoom: 15.8, pitch: 62, bearing: 330,
      },
      {
        at: { area: 'gulshan-2' },
        title: 'Gulshan 2',
        text: 'Embassies, offices and the tallest commercial towers north of the old centre.',
        zoom: 16, pitch: 68, bearing: 210,
      },
      {
        at: { area: 'banani' },
        title: 'Banani',
        text: 'Residential lanes, restaurants and offices beside Banani Lake.',
        zoom: 16, pitch: 66, bearing: 120,
      },
    ],
  },
]

/** Where a stop's camera points, resolved against the loaded city data */
export function stopCenter(stop: TourStop, data: CityData): [number, number] | null {
  const at = stop.at
  if ('lngLat' in at) return at.lngLat
  if ('landmark' in at) {
    const f = data.landmarks.features.find((l) => l.properties.slug === at.landmark)
    return f ? (f.geometry.coordinates as [number, number]) : null
  }
  return data.areas.features.find((a) => a.properties.slug === at.area)?.properties.center ?? null
}

/** Compass bearing from a to b in degrees */
export function bearingBetween([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) {
  const toRad = Math.PI / 180
  const y = Math.sin((lng2 - lng1) * toRad) * Math.cos(lat2 * toRad)
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) - Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lng2 - lng1) * toRad)
  return Math.atan2(y, x) / toRad
}
