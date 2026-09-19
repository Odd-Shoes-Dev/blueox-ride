import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createLocationBroadcaster,
  subscribeToDriverLocation,
  type LocationBroadcaster,
} from '@/shared/services/database'
import type { LivePosition, LiveTrip, PreviewableRide } from '@/domains/core/rides/map/MapShellContext'
import { bearingDegrees, haversineKm } from '@/domains/core/rides/lib/routeProgress'

// The driver's position is sent to passengers this often. Their own dot updates on
// every GPS fix; only the broadcast is throttled (no need to flood the channel).
const BROADCAST_INTERVAL_MS = 5000

// A "trip" the app is following live, for as long as the user wants:
//  - as the DRIVER: read GPS continuously, share it with passengers, keep the
//    screen awake so the phone doesn't stop reporting when it dims;
//  - as a PASSENGER: follow the driver's shared position.
// It lives in the app's shared map state (not on the ride page), so it keeps
// running when the ride panel is closed and the map is all you're looking at.
export function useLiveTrip() {
  const [liveTrip, setLiveTrip] = useState<LiveTrip | null>(null)
  const [livePosition, setLivePosition] = useState<LivePosition | null>(null)
  const [liveError, setLiveError] = useState<string | null>(null)

  const liveTripRef = useRef<LiveTrip | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const broadcasterRef = useRef<LocationBroadcaster | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const lastSendRef = useRef(0)
  const lastFixRef = useRef<{ lat: number; lng: number } | null>(null)
  const lastHeadingRef = useRef<number | undefined>(undefined)

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
    },
    [teardown, resolveHeading]
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

  return { liveTrip, livePosition, liveError, startDriverTrip, watchDriver, stopLiveTrip }
}
