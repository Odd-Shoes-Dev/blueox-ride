import { createContext, useContext, useEffect } from 'react'
import type { ridesRepository } from '@/shared/services/database'
import type { PinKind } from '@/domains/core/rides/components/mapPins'
import type { PlacedPoint } from '@/domains/core/rides/components/PinPlacer'
import type { RideRequest } from '@/shared/types'

// Shared state for the persistent map that sits behind every screen (see
// app/MapShell). It lives here, in the rides domain, so pages and components
// can use it without importing from the app layer.

export type RideWithDriver = ridesRepository.RideWithDriverRow

export interface PinRequest {
  kind: PinKind
  start: PlacedPoint | null
}

// A ride's road route drawn on the home map: the driver's own next ride by default,
// or whichever ride pin the user tapped.
// The little a ride needs to have its route drawn — satisfied by rides from any list.
export interface PreviewableRide {
  id: string
  origin_lat: number
  origin_lng: number
  destination_lat: number
  destination_lng: number
  origin_name?: string
  destination_name?: string
}

export interface FeaturedRoute {
  rideId: string
  points: [number, number][]
  origin: { lat: number; lng: number }
  destination: { lat: number; lng: number }
  summary: { distanceKm: number; durationMin: number } | null
  // Zoom the map to fit the route (true when previewing a tapped ride)
  fit: boolean
  // True for the fallback (the driver's own next ride) rather than a ride the user chose
  isDefault: boolean
}

// How close a found ride is to what was searched for (null = that end wasn't searched)
export interface RideMatch {
  originKm: number | null
  destinationKm: number | null
}
export type RideResult = RideWithDriver & { match: RideMatch }

// The outcome of "Find a Ride": rides that start near the pickup and end near the
// destination, nearest first.
export interface SearchResults {
  rides: RideResult[]
  origin: PlacedPoint | null
  destination: PlacedPoint | null
  radiusKm: number
  date?: string
  // The earliest and latest departure date among matching rides across ALL dates (computed the
  // last time a search ran with no date filter, then kept as-is while narrowing to one date) —
  // what the "Leaving on" field's min/max are bounded to, so it can't be pointed at a day this
  // route has no ride on. Null when there are no matching rides at all to bound it by.
  dateBounds: { min: string; max: string } | null
  // Changes with every search, so the map knows to re-fit itself
  token: number
}

// A vehicle position being followed live (the driver's own, or the driver as seen by a passenger)
export interface LivePosition {
  lat: number
  lng: number
  heading?: number
  accuracy?: number
  updatedAt: number
}

// The trip being followed: which ride, and whether this user is driving it or waiting for it
export interface LiveTrip {
  ride: PreviewableRide
  role: 'driver' | 'passenger'
}

export interface PanelPins {
  origin: PlacedPoint | null
  destination: PlacedPoint | null
}

export interface MapShellValue {
  // Rides shown as markers on the map and listed on the home screen
  rides: RideWithDriver[]
  ridesLoading: boolean
  searching: boolean
  ridesError: string | null
  refreshRides: () => Promise<void>
  // Find rides near the pickup and destination (by distance, not by name)
  searchRides: (options?: { radiusKm?: number; date?: string }) => Promise<void>
  results: SearchResults | null
  clearResults: () => void

  // The signed-in driver's own upcoming rides (soonest first), and the route being previewed
  myRides: RideWithDriver[]
  refreshMyRides: () => Promise<void>
  featured: FeaturedRoute | null
  selectRide: (rideId: string) => void
  deselectRide: (rideId: string) => void
  // Show one ride's route on the map (tapping a card in My Rides, opening Ride
  // Details). It STAYS on the map when panels close, until cleared with null.
  previewRide: (ride: PreviewableRide | null) => void
  previewedRide: PreviewableRide | null
  previewedRideId: string | null
  // Which ride is currently drawn (previewed, tapped, or the driver's own next) and
  // how far along loading its road route is
  featuredRideId: string | null
  featuredStatus: 'none' | 'loading' | 'ready' | 'failed'

  // The trip being searched on the home screen. Kept here (not in the home page)
  // so it survives opening and closing panels.
  origin: PlacedPoint | null
  destination: PlacedPoint | null
  setOrigin: (point: PlacedPoint | null) => void
  setDestination: (point: PlacedPoint | null) => void
  locatingUser: boolean
  geoFailed: boolean
  manualPickupOverride: boolean
  setManualPickupOverride: (value: boolean) => void
  // True while the pickup is simply "wherever the user is" (no origin field/pin).
  usingAutoPickup: boolean
  handleLocationFound: (coords: { lat: number; lng: number }) => void
  handleLocationUnavailable: () => void

  // Placing a pin on the map. `requestPin` resolves with the confirmed point,
  // or null if the user cancelled (or navigated away).
  editing: PinRequest | null
  requestPin: (kind: PinKind, start: PlacedPoint | null) => Promise<PlacedPoint | null>
  finishPin: (point: PlacedPoint | null) => void

  // Pins that a panel page (e.g. Offer a Ride) wants shown on the map
  panelPins: PanelPins | null
  setPanelPins: (pins: PanelPins | null) => void

  // Open ride requests shown as their own pins while the Ride Requests page is open
  // (signed-in drivers only — requests aren't readable while signed out; see migration 14).
  // Tapping one sets `selectedRequestId`; the page reacts to it and clears it back to null.
  requestPins: RideRequest[] | null
  setRequestPins: (requests: RideRequest[] | null) => void
  selectedRequestId: string | null
  selectRequest: (requestId: string | null) => void
  // Live trip: the driver shares their position as they drive (the map follows them,
  // shows distance/time left, keeps the screen awake); passengers follow the driver.
  // It runs in the app shell, so it keeps going when panels are closed.
  liveTrip: LiveTrip | null
  livePosition: LivePosition | null
  liveError: string | null
  tripRoute: { points: [number, number][]; summary: { distanceKm: number; durationMin: number } | null } | null
  // The driver's seats during a trip, and a way to change them (-1 = picked someone up on the road)
  tripSeats: { available: number; total: number } | null
  adjustTripSeats: (delta: number) => Promise<void>
  startDriverTrip: (ride: PreviewableRide) => void
  watchDriver: (ride: PreviewableRide) => void
  stopLiveTrip: () => void

  // Move the map somewhere (place search results); report/read the map's current centre
  focus: { lat: number; lng: number } | null
  focusOn: (lat: number, lng: number) => void
  reportMapCenter: (center: { lat: number; lng: number }) => void
  getMapCenter: () => { lat: number; lng: number } | null
}

export const MapShellContext = createContext<MapShellValue | null>(null)

export function useMapShell(): MapShellValue {
  const value = useContext(MapShellContext)
  if (!value) throw new Error('useMapShell must be used inside <MapShellProvider>')
  return value
}

// For components that also work outside the shell (e.g. LocationPicker on a
// standalone page) and adapt when the shared map is available.
export function useOptionalMapShell(): MapShellValue | null {
  return useContext(MapShellContext)
}

// Shows a route's two ends on the shared map while a panel page is mounted.
export function useMapPins(origin: PlacedPoint | null, destination: PlacedPoint | null) {
  const shell = useOptionalMapShell()
  const setPanelPins = shell?.setPanelPins

  useEffect(() => {
    setPanelPins?.({ origin, destination })
    return () => setPanelPins?.(null)
    // Keyed on the coordinates: callers pass fresh objects every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPanelPins, origin?.lat, origin?.lng, destination?.lat, destination?.lng])
}

// Shows open ride requests as their own pins on the shared map while the Ride Requests
// page is mounted (see RideRequestsPage). Cleared when it unmounts or the list changes.
export function useRideRequestPins(requests: RideRequest[]) {
  const shell = useOptionalMapShell()
  const setRequestPins = shell?.setRequestPins

  useEffect(() => {
    setRequestPins?.(requests)
    return () => setRequestPins?.(null)
  }, [setRequestPins, requests])
}
