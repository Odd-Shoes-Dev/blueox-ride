// Single source of truth for the map tile provider. Swapping providers again
// later is a change to this file only.
//
// Reverted to plain OSM tiles: CARTO's basemap CDN now requires an API key
// even for the "light_all" raster style (started showing "API KEY REQUIRED"
// watermarks in production — their free-anonymous-usage policy apparently
// changed since this was picked). A real "less noisy" style needs either a
// paid/signup provider (MapTiler, Stadia, CARTO all now gate on a key) or a
// verified-working free alternative — worth revisiting, but don't swap this
// again without first loading the tile URL directly in a browser to confirm
// it actually renders without a key.
export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

// Kampala, Uganda — used as the default map center when no location is known yet.
export const DEFAULT_MAP_CENTER: [number, number] = [0.3476, 32.5825]
