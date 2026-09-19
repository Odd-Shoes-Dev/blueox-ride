import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { ridesRepository, withTimeout, RequestTimeoutError } from '@/shared/services/database'
import { reverseGeocode } from '@/shared/services/geocoding'
import { getRoute } from '@/shared/services/routing'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { useLiveTrip } from '@/domains/core/rides/hooks/useLiveTrip'
import type { PinKind } from '@/domains/core/rides/components/mapPins'
import type { PlacedPoint } from '@/domains/core/rides/components/PinPlacer'
import {
  MapShellContext,
  type FeaturedRoute,
  type MapShellValue,
  type PreviewableRide,
  type PanelPins,
  type PinRequest,
  type RideWithDriver,
} from '@/domains/core/rides/map/MapShellContext'

// Holds everything the persistent map and the screens on top of it share, so
// moving between screens (opening Offer a Ride, My Rides, ...) never reloads
// the map, asks for the location again, or forgets what was searched.
export function MapShellProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  // ---- Rides (markers on the map + the home screen's list) ----
  const [rides, setRides] = useState<RideWithDriver[]>([])
  const [ridesLoading, setRidesLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [ridesError, setRidesError] = useState<string | null>(null)
  const hasFetched = useRef(false)

  const loadRides = useCallback(async (filters: { originName?: string; destinationName?: string }, limit: number) => {
    setRidesLoading(true)
    setRidesError(null)
    try {
      const data = await withTimeout(ridesRepository.searchActiveRides({ ...filters, limit }), 15000)
      setRides(data)
    } catch (err) {
      if (err instanceof RequestTimeoutError) {
        console.error('Request timed out')
        setRidesError('Request timed out. Please check your connection.')
      } else {
        console.error('Fetch error:', err)
        setRidesError('An error occurred. Please try again.')
      }
    } finally {
      setRidesLoading(false)
    }
  }, [])

  const refreshRides = useCallback(() => loadRides({}, 20), [loadRides])

  useEffect(() => {
    // Only fetch once on mount
    if (!hasFetched.current) {
      hasFetched.current = true
      refreshRides()
    }
  }, [refreshRides])

  // ---- The driver's own rides, and the route being previewed on the home map ----
  const { user } = useAuth()
  const userId = user?.id
  const [myRides, setMyRides] = useState<RideWithDriver[]>([])

  const refreshMyRides = useCallback(async () => {
    try {
      setMyRides(userId ? await ridesRepository.getUpcomingRidesForDriver(userId) : [])
    } catch (err) {
      console.error('Could not load your rides:', err)
    }
  }, [userId])

  useEffect(() => {
    refreshMyRides()
  }, [refreshMyRides])

  const [selectedRideId, setSelectedRideId] = useState<string | null>(null)
  const selectRide = useCallback((rideId: string) => setSelectedRideId(rideId), [])
  // Only clears if it's still the selected ride: tapping ride B closes ride A's popup,
  // and that close must not wipe out B's selection.
  const deselectRide = useCallback((rideId: string) => setSelectedRideId((current) => (current === rideId ? null : current)), [])

  // A ride whose route the user asked to see (a card in My Rides, Ride Details).
  // It stays until cleared, so closing a panel doesn't make the route vanish.
  const [activePreview, setActivePreview] = useState<PreviewableRide | null>(null)
  const previewRide = useCallback((ride: PreviewableRide | null) => setActivePreview(ride), [])

  // ---- Live trip (driving it, or following the driver) ----
  const live = useLiveTrip()
  const { startDriverTrip: beginDriverTrip, watchDriver: beginWatching } = live
  // Starting a trip also puts the ride's route on the map, so its progress has a line to follow.
  const startDriverTrip = useCallback(
    (ride: PreviewableRide) => {
      setActivePreview(ride)
      beginDriverTrip(ride)
    },
    [beginDriverTrip]
  )
  const watchDriver = useCallback(
    (ride: PreviewableRide) => {
      setActivePreview(ride)
      beginWatching(ride)
    },
    [beginWatching]
  )

  // Featured ride: the previewed/tapped one, otherwise the driver's own next ride.
  const featuredRide = useMemo<PreviewableRide | null>(() => {
    const tapped = selectedRideId ? [...rides, ...myRides].find((ride) => ride.id === selectedRideId) : undefined
    return activePreview ?? tapped ?? myRides[0] ?? null
  }, [activePreview, selectedRideId, rides, myRides])

  // Road routes are cached per ride so tapping the same pin again is instant.
  type RouteEntry = { points: [number, number][] | null; summary: { distanceKm: number; durationMin: number } | null }
  const [routes, setRoutes] = useState<Record<string, RouteEntry>>({})
  const requestedRoutes = useRef(new Set<string>())

  // Fetch a ride's road route once (cached by ride id).
  const ensureRoute = useCallback((ride: PreviewableRide | null) => {
    if (!ride || !ride.origin_lat || !ride.origin_lng || !ride.destination_lat || !ride.destination_lng) return
    if (requestedRoutes.current.has(ride.id)) return
    requestedRoutes.current.add(ride.id)

    getRoute(
      { lat: ride.origin_lat, lng: ride.origin_lng },
      { lat: ride.destination_lat, lng: ride.destination_lng }
    )
      .then((route) =>
        setRoutes((prev) => ({
          ...prev,
          [ride.id]: route
            ? { points: route.polyline, summary: { distanceKm: route.distanceKm, durationMin: route.durationMin } }
            : { points: null, summary: null },
        }))
      )
      .catch((err) => {
        console.error('Route calculation error:', err)
        setRoutes((prev) => ({ ...prev, [ride.id]: { points: null, summary: null } }))
      })
  }, [])

  const featuredId = featuredRide?.id
  useEffect(() => {
    ensureRoute(featuredRide)
    // Keyed on the id: the ride object is rebuilt whenever a list refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuredId, ensureRoute])

  // The trip's own route is needed even if the user previews a different ride meanwhile.
  const tripRide = live.liveTrip?.ride ?? null
  const tripRideId = tripRide?.id
  useEffect(() => {
    ensureRoute(tripRide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripRideId, ensureRoute])
  const tripEntry = tripRideId ? routes[tripRideId] : undefined
  const tripRoute = useMemo(
    () => (tripEntry?.points ? { points: tripEntry.points, summary: tripEntry.summary } : null),
    [tripEntry]
  )

  const featuredEntry = featuredId ? routes[featuredId] : undefined
  const featured = useMemo<FeaturedRoute | null>(() => {
    if (!featuredRide || !featuredEntry?.points || !featuredRide.destination_lat || !featuredRide.destination_lng) return null
    return {
      rideId: featuredRide.id,
      points: featuredEntry.points,
      origin: { lat: featuredRide.origin_lat, lng: featuredRide.origin_lng },
      destination: { lat: featuredRide.destination_lat, lng: featuredRide.destination_lng },
      summary: featuredEntry.summary,
      fit: activePreview?.id === featuredRide.id || selectedRideId === featuredRide.id,
    }
  }, [featuredRide, featuredEntry, selectedRideId, activePreview])

  const featuredStatus: MapShellValue['featuredStatus'] = !featuredRide
    ? 'none'
    : !featuredEntry
      ? 'loading'
      : featuredEntry.points
        ? 'ready'
        : 'failed'

  // ---- The trip being searched, and where the user is ----
  const [origin, setOrigin] = useState<PlacedPoint | null>(null)
  const [destination, setDestination] = useState<PlacedPoint | null>(null)
  const [locatingUser, setLocatingUser] = useState(true)
  const [geoFailed, setGeoFailed] = useState(false)
  const [manualPickupOverride, setManualPickupOverrideState] = useState(false)
  // Read from the geolocation callback, which can outlive the render that created it.
  const manualOverrideRef = useRef(false)

  const setManualPickupOverride = useCallback((value: boolean) => {
    manualOverrideRef.current = value
    setManualPickupOverrideState(value)
  }, [])

  // Auto-detected pickup is a full reverse-geocoded address (e.g. "Kampala
  // Road, Kampala"), which rarely appears verbatim in a driver-typed
  // origin_name — filtering on it would silently return nothing. Only use
  // the origin as a text filter once the user (or the geo-fallback form)
  // explicitly picked it themselves.
  const usingAutoPickup = !geoFailed && !manualPickupOverride

  const searchRides = useCallback(async () => {
    if (searching) return
    setSearching(true)
    try {
      await loadRides(
        {
          originName: usingAutoPickup ? undefined : origin?.name,
          destinationName: destination?.name,
        },
        50
      )
    } finally {
      setSearching(false)
    }
  }, [searching, loadRides, usingAutoPickup, origin, destination])

  const handleLocationFound = useCallback((coords: { lat: number; lng: number }) => {
    // The map can report several times as the reading sharpens or the user
    // presses its locate button. Once they've chosen their own pickup ("Change"),
    // don't overwrite it.
    if (manualOverrideRef.current) {
      setLocatingUser(false)
      return
    }
    reverseGeocode(coords.lat, coords.lng)
      .then((name) => setOrigin({ ...coords, name }))
      .catch(() => setOrigin({ ...coords, name: 'Current location' }))
      .finally(() => setLocatingUser(false))
  }, [])

  const handleLocationUnavailable = useCallback(() => {
    setGeoFailed(true)
    setLocatingUser(false)
  }, [])

  // ---- Placing a pin on the map ----
  const [editing, setEditing] = useState<PinRequest | null>(null)
  const pinResolverRef = useRef<((point: PlacedPoint | null) => void) | null>(null)

  const finishPin = useCallback((point: PlacedPoint | null) => {
    pinResolverRef.current?.(point)
    pinResolverRef.current = null
    setEditing(null)
  }, [])

  const requestPin = useCallback((kind: PinKind, start: PlacedPoint | null) => {
    return new Promise<PlacedPoint | null>((resolve) => {
      pinResolverRef.current?.(null) // a new request replaces any unfinished one
      pinResolverRef.current = resolve
      setEditing({ kind, start })
    })
  }, [])

  // Leaving the screen that asked cancels its pending request.
  useEffect(() => {
    finishPin(null)
  }, [pathname, finishPin])

  // ---- Pins from panel pages, place-search focus, map centre ----
  const [panelPins, setPanelPins] = useState<PanelPins | null>(null)
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null)
  const focusOn = useCallback((lat: number, lng: number) => setFocus({ lat, lng }), [])
  const mapCenterRef = useRef<{ lat: number; lng: number } | null>(null)
  const reportMapCenter = useCallback((center: { lat: number; lng: number }) => {
    mapCenterRef.current = center
  }, [])
  const getMapCenter = useCallback(() => mapCenterRef.current, [])

  const value = useMemo<MapShellValue>(
    () => ({
      rides,
      ridesLoading,
      searching,
      ridesError,
      refreshRides,
      searchRides,
      myRides,
      refreshMyRides,
      featured,
      selectRide,
      deselectRide,
      previewRide,
      previewedRide: activePreview,
      previewedRideId: activePreview?.id ?? null,
      featuredRideId: featuredRide?.id ?? null,
      featuredStatus,
      origin,
      destination,
      setOrigin,
      setDestination,
      locatingUser,
      geoFailed,
      manualPickupOverride,
      setManualPickupOverride,
      usingAutoPickup,
      handleLocationFound,
      handleLocationUnavailable,
      editing,
      requestPin,
      finishPin,
      panelPins,
      setPanelPins,
      liveTrip: live.liveTrip,
      livePosition: live.livePosition,
      liveError: live.liveError,
      tripRoute,
      startDriverTrip,
      watchDriver,
      stopLiveTrip: live.stopLiveTrip,
      focus,
      focusOn,
      reportMapCenter,
      getMapCenter,
    }),
    [
      rides,
      ridesLoading,
      searching,
      ridesError,
      refreshRides,
      searchRides,
      myRides,
      refreshMyRides,
      featured,
      selectRide,
      deselectRide,
      previewRide,
      activePreview,
      featuredRide,
      featuredStatus,
      origin,
      destination,
      locatingUser,
      geoFailed,
      manualPickupOverride,
      setManualPickupOverride,
      usingAutoPickup,
      handleLocationFound,
      handleLocationUnavailable,
      editing,
      requestPin,
      finishPin,
      panelPins,
      live.liveTrip,
      live.livePosition,
      live.liveError,
      live.stopLiveTrip,
      tripRoute,
      startDriverTrip,
      watchDriver,
      focus,
      focusOn,
      reportMapCenter,
      getMapCenter,
    ]
  )

  return <MapShellContext.Provider value={value}>{children}</MapShellContext.Provider>
}
