// Internal adapter for Nominatim (OpenStreetMap geocoding). Nothing outside
// shared/services/geocoding should know the vendor is Nominatim — callers use
// the normalized functions/types exported from ./index.ts.

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
  address?: NominatimAddress
}

export interface PlaceSuggestion {
  id: string
  shortName: string
  secondaryText: string
  lat: number
  lng: number
}

function getShortName(result: NominatimResult): string {
  const parts: string[] = []
  if (result.address) {
    if (result.address.road) parts.push(result.address.road)
    if (result.address.suburb) parts.push(result.address.suburb)
    const city = result.address.city || result.address.town || result.address.village
    if (city) parts.push(city)
  }
  return parts.length > 0 ? parts.join(', ') : result.display_name.split(',').slice(0, 2).join(',')
}

function getSecondaryText(result: NominatimResult): string {
  if (result.address) {
    const parts: string[] = []
    if (result.address.state) parts.push(result.address.state)
    if (result.address.country) parts.push(result.address.country)
    return parts.join(', ')
  }
  return result.display_name.split(',').slice(2).join(',').trim()
}

export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  if (!query || query.length < 3) return []

  const encodedQuery = encodeURIComponent(query)
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&countrycodes=ug&limit=5&addressdetails=1`,
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
