import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createLocationBroadcaster,
  subscribeToDriverLocation,
  subscribeToPassengerLocation,
  ridesRepository,
  type LocationBroadcaster,
} from '@/shared/services/database'
import type { LivePosition, LiveTrip, PreviewableRide } from '@/domains/core/rides/map/MapShellContext'
import { bearingDegrees, haversineKm } from '@/domains/core/rides/lib/routeProgress'

// The driver's position is sent to passengers this often. Their own dot updates on
// every GPS fix; only the broadcast is throttled (no need to flood the channel).
const BROADCAST_INTERVAL_MS = 5000

// A passenger sharing their own position back, as seen by the driver during their trip.
export interface PassengerPosition {
  id: string
  name: string
  lat: number
  lng: number
  updatedAt: number
}

// A "trip" the app is following live, for as long as the user wants:
//  - as the DRIVER: read GPS continuously, share it with passengers, keep the
//    screen awake so the phone doesn't stop reporting when it dims;
//  - as a PASSENGER: follow the driver's shared position.
// It lives in the app's shared map state (not on the ride page), so it keeps
// running when the ride panel is closed and the map is all you're looking at.
//
// `passengerLocationSharingEnabled` (app_settings, see AppSettingsContext): while on, starting a
// trip as the driver also opens a read-only listener on each confirmed passenger's own share —
// silence from someone who never opted in just means no marker for them, there's no separate
// "did they say yes" signal to check first (see usePassengerLocationSharing, the other side).
export function useLiveTrip(passengerLocationSharingEnabled: boolean) {
  const [liveTrip, setLiveTrip] = useState<LiveTrip | null>(null)
  const [livePosition, setLivePosition] = useState<LivePosition | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)
  const [passengerPositions, setPassengerPositions] = useState<Record<string, PassengerPosition>>({})

  const liveTripRef = useRef<LiveTrip | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const broadcasterRef = useRef<LocationBroadcaster | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const lastSendRef = useRef(0)
  const lastFixRef = useRef<{ lat: number; lng: number } | null>(null)
  const lastHeadingRef = useRef<number | undefined>(undefined)
  // Listeners on confirmed passengers' own shares, while driving a trip.
  const passengerUnsubscribersRef = useRef<Map<string, () => void>>(new Map())

  // Which way the vehicle is pointing. GPS reports a heading only while moving (and
  // not on every device), so otherwise work it out from the last two positions, and
  // keep the last known direction while stopped rather than snapping back to "unknown".
  const resolveHeading = useCallback((lat: number, lng: number, reported: number | null | undefined): number | undefined => {
    const here = { lat, lng }
    if (typeof reported === 'number' && !Number.isNaN(reported)) {
      lastHeadingRef.current = reported
      lastFixRef.current = here
    } else if (!lastFixRef.current) {
      lastFixRef.current = here
    } else if (haversineKm(lastFixRef.current, here) * 1000 > 5) {
      lastHeadingRef.current = bearingDegrees(lastFixRef.current, here)
      lastFixRef.current = here
    }
    return lastHeadingRef.current
  }, [])

  const teardown = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    broadcasterRef.current?.stop()
    broadcasterRef.current = null
    unsubscribeRef.current?.()
    unsubscribeRef.current = null
    liveTripRef.current = null
    lastFixRef.current = null
    lastHeadingRef.current = undefined
    for (const stop of passengerUnsubscribersRef.current.values()) stop()
    passengerUnsubscribersRef.current.clear()
    setPassengerPositions({})
  }, [])

  const stopLiveTrip = useCallback(() => {
    teardown()
    setLiveTrip(null)
    setLivePosition(null)
    setLiveError(null)
  }, [teardown])

  const startDriverTrip = useCallback(
    (ride: PreviewableRide) => {
      if (!navigator.geolocation) {
        setLiveError('Location is not supported by your browser.')
        return
      }

      teardown()
      const trip: LiveTrip = { ride, role: 'driver' }
      liveTripRef.current = trip
      setLiveTrip(trip)
      setLivePosition(null)
      setLiveError(null)

      broadcasterRef.current = createLocationBroadcaster(ride.id)
      lastSendRef.current = 0

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const heading = resolveHeading(position.coords.latitude, position.coords.longitude, position.coords.heading)
          setLivePosition({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            heading,
            accuracy: position.coords.accuracy,
            updatedAt: Date.now(),
          })
          setLiveError(null)

          const now = Date.now()
          if (now - lastSendRef.current >= BROADCAST_INTERVAL_MS) {
            lastSendRef.current = now
            broadcasterRef.current?.send({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              heading,
            })
          }
        },
        (error) => {
          console.error('Geolocation watch error:', error)
          if (error.code === error.PERMISSION_DENIED) {
            teardown()
            setLiveTrip(null)
            setLivePosition(null)
            setLiveError('Location permission was denied. Allow location access to start a trip.')
          } else {
            // A dropped signal (tunnel, cloud cover) usually recovers on its own.
            setLiveError('Waiting for a GPS signal…')
          }
        },
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
      )

      // Listen for whichever confirmed passengers chose to share back — see the note on
      // useLiveTrip above. Fetched once per trip start, not kept in sync afterward: someone
      // confirmed mid-trip (rare — seats close once a trip starts) wouldn't get a listener
      // until the next trip.
      if (passengerLocationSharingEnabled) {
        ridesRepository
          .getConfirmedPassengers(ride.id)
          .then((passengers) => {
            if (liveTripRef.current !== trip) return // trip already ended/changed
            for (const passenger of passengers) {
              const stop = subscribeToPassengerLocation(ride.id, passenger.id, (update) => {
                setPassengerPositions((prev) => ({
                  ...prev,
                  [passenger.id]: {
                    id: passenger.id,
                    name: passenger.full_name,
                    lat: update.lat,
                    lng: update.lng,
                    updatedAt: Date.now(),
                  },
                }))
              })
              passengerUnsubscribersRef.current.set(passenger.id, stop)
            }
          })
          .catch((error) => console.error('Could not check for sharing passengers:', error))
      }
    },
    [teardown, resolveHeading, passengerLocationSharingEnabled]
  )

  const watchDriver = useCallback(
    (ride: PreviewableRide) => {
      const current = liveTripRef.current
      if (current?.role === 'passenger' && current.ride.id === ride.id) return // already following

      teardown()
      const trip: LiveTrip = { ride, role: 'passenger' }
      liveTripRef.current = trip
      setLiveTrip(trip)
      setLivePosition(null)
      setLiveError(null)

      unsubscribeRef.current = subscribeToDriverLocation(ride.id, (update) => {
        const heading = resolveHeading(update.lat, update.lng, update.heading)
        setLivePosition({ lat: update.lat, lng: update.lng, heading, updatedAt: Date.now() })
      })
    },
    [teardown, resolveHeading]
  )

  // Keep the screen awake while driving a trip: a dimmed or locked screen makes the
  // browser stop reporting the position. (The lock is released if the tab is hidden,
  // so it's asked for again whenever the app comes back to the front.)
  const isDriverTrip = liveTrip?.role === 'driver'
  useEffect(() => {
    if (!isDriverTrip || !('wakeLock' in navigator)) return

    let cancelled = false
    let sentinel: WakeLockSentinel | null = null

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          lock.release().catch(() => {})
          return
        }
        sentinel = lock
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null
        })
      } catch {
        // Not allowed (e.g. low battery mode) — the trip still works, the screen just may dim.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !sentinel) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [isDriverTrip])

  // Nothing keeps running once the app itself is gone.
  useEffect(() => teardown, [teardown])

  return { liveTrip, livePosition, liveError, passengerPositions, startDriverTrip, watchDriver, stopLiveTrip }
}
