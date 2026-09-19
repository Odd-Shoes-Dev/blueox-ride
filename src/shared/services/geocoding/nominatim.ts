// Internal adapter for Nominatim (OpenStreetMap geocoding). Nothing outside
// shared/services/geocoding should know the vendor is Nominatim — callers use
// the normalized functions/types exported from ./index.ts.

import type { PlaceSuggestion, SearchOptions } from './types'

interface NominatimAddress {
  road?: string
  suburb?: string
  city?: string
  town?: string
  village?: string
  state?: string
  country?: string
}

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  // The feature's own name — set for schools, churches, shops, roads, etc.
  name?: string
  class?: string
  category?: string
  type?: string
  address?: NominatimAddress
}

// Half-width, in degrees (~28 km), of the box used to bias results toward `near`.
const NEAR_BIAS_DEGREES = 0.25

function getShortName(result: NominatimResult): string {
  const parts: string[] = []
  const address = result.address
  if (address) {
    // A named feature (school, church, supermarket...) leads with its own name.
    // Without this the label would show only the street it happens to sit on,
    // so a search for "Kabalagala Primary School" would read as "Some Road, ...".
    const featureName = result.name && result.name !== address.road ? result.name : undefined
    if (featureName) parts.push(featureName)
    else if (address.road) parts.push(address.road)
    if (address.suburb) parts.push(address.suburb)
    const city = address.city || address.town || address.village
    if (city) parts.push(city)
  }
  const unique = parts.filter((part, index) => parts.indexOf(part) === index)
  return unique.length > 0 ? unique.join(', ') : result.display_name.split(',').slice(0, 2).join(',')
}

// e.g. "school" -> "School", "place_of_worship" -> "Place of worship"; every
// kind of road collapses to "Road". Generic OSM values ("yes") are dropped.
function getTypeLabel(result: NominatimResult): string {
  if ((result.class || result.category) === 'highway') return 'Road'
  const type = result.type
  if (!type || type === 'yes') return ''
  const label = type.replace(/_/g, ' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function getSecondaryText(result: NominatimResult): string {
  if (result.address) {
    const parts: string[] = []
    const typeLabel = getTypeLabel(result)
    if (typeLabel) parts.push(typeLabel)
    if (result.address.state) parts.push(result.address.state)
    return parts.join(' · ')
  }
  return result.display_name.split(',').slice(2).join(',').trim()
}

export async function searchPlaces(query: string, options?: SearchOptions): Promise<PlaceSuggestion[]> {
  if (!query || query.length < 3) return []

  const encodedQuery = encodeURIComponent(query)
  // viewbox is left,top,right,bottom; without `bounded` it only *prefers* results inside it.
  const near = options?.near
  const viewbox = near
    ? `&viewbox=${near.lng - NEAR_BIAS_DEGREES},${near.lat + NEAR_BIAS_DEGREES},${near.lng + NEAR_BIAS_DEGREES},${near.lat - NEAR_BIAS_DEGREES}`
    : ''
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&countrycodes=ug&limit=8&addressdetails=1${viewbox}`,
    { headers: { 'Accept-Language': 'en' } }
  )

  if (!response.ok) {
    throw new Error('Nominatim search failed')
  }

  const results: NominatimResult[] = await response.json()

  return results.map((result) => ({
    id: String(result.place_id),
    shortName: getShortName(result),
    secondaryText: getSecondaryText(result),
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
  }))
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
    { headers: { 'Accept-Language': 'en' } }
  )

  if (!response.ok) {
    throw new Error('Nominatim reverse geocode failed')
  }

  const data: NominatimResult = await response.json()

  if (data.address) {
    const parts: string[] = []
    if (data.address.road) parts.push(data.address.road)
    if (data.address.suburb) parts.push(data.address.suburb)
    const city = data.address.city || data.address.town || data.address.village
    if (city) parts.push(city)
    if (parts.length > 0) return parts.join(', ')
  }

  return data.display_name?.split(',').slice(0, 2).join(',') || 'Selected location'
}
