// Single source of truth for the map tile provider. Swapping providers again
// later is a change to this file only.
//
// Using CARTO's free "Positron" basemap instead of raw OSM tiles: it drops
// the default OSM style's dense shop/POI/park labels that made the map feel
// noisy, while keeping roads and place names legible under our own markers
// and route lines. No API key required for reasonable (non-commercial-scale)
// usage. See https://github.com/CartoDB/basemap-styles for the style/terms.
export const MAP_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

// Kampala, Uganda — used as the default map center when no location is known yet.
export const DEFAULT_MAP_CENTER: [number, number] = [0.3476, 32.5825]
