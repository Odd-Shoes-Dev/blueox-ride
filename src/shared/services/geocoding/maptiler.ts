// Internal adapter for MapTiler Geocoding. Nothing outside
// shared/services/geocoding should know the vendor is MapTiler — callers use
// the normalized functions/types exported from ./index.ts.

import type { PlaceSuggestion, SearchOptions } from './types'

const API_KEY = import.meta.env.VITE_MAPTILER_API_KEY as string | undefined

export const maptilerGeocodingAvailable = Boolean(API_KEY)

interface MapTilerContextEntry {
  id?: string
  text?: string
}

interface MapTilerFeature {
  id: string
  text?: string
  place_name?: string
  place_type?: string[]
  center?: [number, number] // [lng, lat]
  geometry?: { type: string; coordinates: number[] }
  context?: MapTilerContextEntry[]
  properties?: { categories?: string[] }
}

interface MapTilerResponse {
  features?: MapTilerFeature[]
}

// Parent areas that read naturally after a place name ("Kabalagala, Kampala").
const NEARBY_AREA_TYPES = ['neighbourhood', 'locality', 'municipal_district', 'municipality', 'joint_municipality', 'place']
const REGION_TYPES = ['region', 'subregion', 'county']

function contextType(entry: MapTilerContextEntry): string {
  return (entry.id ?? '').split('.')[0]
}

function humanize(value: string): string {
  const label = value.replace(/[_-]/g, ' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function getCoordinates(feature: MapTilerFeature): [number, number] | null {
  if (feature.center) return [feature.center[1], feature.center[0]]
  const coords = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : undefined
  return coords ? [coords[1], coords[0]] : null
}

function getShortName(feature: MapTilerFeature): string {
  const name = feature.text || feature.place_name?.split(',')[0] || 'Unnamed place'
  const areas = (feature.context ?? [])
    .filter((entry) => NEARBY_AREA_TYPES.includes(contextType(entry)) && entry.text)
    .map((entry) => entry.text as string)
    .slice(0, 2)
  const parts = [name, ...areas]
  return parts.filter((part, index) => parts.indexOf(part) === index).join(', ')
}

function getSecondaryText(feature: MapTilerFeature): string {
  const kind = feature.place_type?.[0]
  const category = feature.properties?.categories?.[0]
  let label = ''
  if (kind === 'poi') label = category ? humanize(category) : 'Place'
  else if (kind === 'road') label = 'Road'
  else if (kind) label = humanize(kind)

  const region = (feature.context ?? []).find((entry) => REGION_TYPES.includes(contextType(entry)))?.text
  return [label, region].filter(Boolean).join(' · ')
}

// Address for a dropped pin, e.g. "Ruhara Road, Kihumuro, Mbarara". The lookup
// returns one best match per layer (shop, street, neighbourhood, city, ...);
// businesses are skipped on purpose so a pin dropped on the street isn't
// labelled with whichever shop happens to be nearby.
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  if (!API_KEY) throw new Error('MapTiler key not configured')

  const params = new URLSearchParams({ key: API_KEY, language: 'en' })
  const response = await fetch(`https://api.maptiler.com/geocoding/${lng},${lat}.json?${params.toString()}`)
  if (!response.ok) {
    throw new Error(`MapTiler reverse geocoding failed (${response.status})`)
  }

  const features = ((await response.json()) as MapTilerResponse).features ?? []
  const ofType = (types: string[]) => features.filter((f) => f.place_type?.some((t) => types.includes(t)))

  const street = ofType(['road', 'address'])[0]?.text
  const areas = ofType(NEARBY_AREA_TYPES)
    .map((f) => f.text)
    .filter((text): text is string => Boolean(text))
    .slice(0, 2)

  const parts = [street, ...areas].filter((part): part is string => Boolean(part))
  const unique = parts.filter((part, index) => parts.indexOf(part) === index)
  // Nothing usable here (e.g. open countryside) — let the caller fall back to another provider.
  if (unique.length === 0) throw new Error('MapTiler reverse geocoding returned no address')
  return unique.join(', ')
}

export async function searchPlaces(query: string, options?: SearchOptions): Promise<PlaceSuggestion[]> {
  if (!API_KEY) throw new Error('MapTiler key not configured')
  if (!query || query.length < 3) return []

  const params = new URLSearchParams({
    key: API_KEY,
    country: 'ug',
    limit: '8',
    language: 'en',
  })
  // Rank results closer to this point higher (e.g. the centre of the map).
  if (options?.near) params.set('proximity', `${options.near.lng},${options.near.lat}`)

  const response = await fetch(
    `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?${params.toString()}`
  )
  if (!response.ok) {
    throw new Error(`MapTiler geocoding failed (${response.status})`)
  }

  const data: MapTilerResponse = await response.json()

  const suggestions: PlaceSuggestion[] = []
  for (const feature of data.features ?? []) {
    const coords = getCoordinates(feature)
    if (!coords) continue
    suggestions.push({
      id: feature.id,
      shortName: getShortName(feature),
      secondaryText: getSecondaryText(feature),
      lat: coords[0],
      lng: coords[1],
    })
  }
  return suggestions
}
