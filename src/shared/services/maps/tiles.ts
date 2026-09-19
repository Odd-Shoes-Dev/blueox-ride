// Single source of truth for the map tile provider. Swapping providers again
// later is a change to this file only.
//
// Uses MapTiler's hosted raster tiles ("Streets" style) when
// VITE_MAPTILER_API_KEY is set. Falls back to plain OSM tiles otherwise, so
// the app never breaks if the key is missing (e.g. a fresh clone before the
// dev has added their own key). Unlike the earlier CARTO attempt, this was
// confirmed to require a key up front — no surprise gating.
const MAPTILER_API_KEY = import.meta.env.VITE_MAPTILER_API_KEY as string | undefined
const MAPTILER_STYLE = 'streets-v4'

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

const MAPTILER_TILE_URL = MAPTILER_API_KEY
  ? `https://api.maptiler.com/maps/${MAPTILER_STYLE}/{z}/{x}/{y}.png?key=${MAPTILER_API_KEY}`
  : null
const MAPTILER_ATTRIBUTION =
  '&copy; <a href="https://www.maptiler.com/copyright/" target="_blank">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'

export const MAP_TILE_URL = MAPTILER_TILE_URL ?? OSM_TILE_URL
export const MAP_TILE_ATTRIBUTION = MAPTILER_TILE_URL ? MAPTILER_ATTRIBUTION : OSM_ATTRIBUTION

// Kampala, Uganda — used as the default map center when no location is known yet.
export const DEFAULT_MAP_CENTER: [number, number] = [0.3476, 32.5825]
