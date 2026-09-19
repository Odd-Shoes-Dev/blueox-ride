// Vendor-neutral types shared by every geocoding provider adapter.

export interface PlaceSuggestion {
  id: string
  shortName: string
  secondaryText: string
  lat: number
  lng: number
}

export interface SearchOptions {
  // Prefer results close to this point (e.g. the centre of the map the user is looking at).
  near?: { lat: number; lng: number }
}
