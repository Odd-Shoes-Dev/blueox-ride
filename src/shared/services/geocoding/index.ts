import * as nominatim from './nominatim'
import * as maptiler from './maptiler'
import type { PlaceSuggestion, SearchOptions } from './types'

export type { PlaceSuggestion, SearchOptions } from './types'

// Both lookups prefer MapTiler (better coverage of businesses/schools/etc.,
// and place search can rank by distance to the map) and quietly fall back to
// Nominatim when no MapTiler key is configured, the request fails (quota,
// network, outage), or MapTiler has nothing for that spot. Callers never see
// which provider answered.
export async function searchPlaces(query: string, options?: SearchOptions): Promise<PlaceSuggestion[]> {
  if (maptiler.maptilerGeocodingAvailable) {
    try {
      return await maptiler.searchPlaces(query, options)
    } catch (error) {
      console.warn('MapTiler place search failed, falling back to Nominatim:', error)
    }
  }
  return nominatim.searchPlaces(query, options)
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  if (maptiler.maptilerGeocodingAvailable) {
    try {
      return await maptiler.reverseGeocode(lat, lng)
    } catch (error) {
      console.warn('MapTiler reverse geocoding failed, falling back to Nominatim:', error)
    }
  }
  return nominatim.reverseGeocode(lat, lng)
}
