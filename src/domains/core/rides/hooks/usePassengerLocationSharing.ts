import { useCallback, useEffect, useRef, useState } from 'react'
import {
  bookingsRepository,
  createPassengerLocationBroadcaster,
  subscribeToDriverLocation,
  type LocationBroadcaster,
} from '@/shared/services/database'

// The other direction from useLiveTrip's driver-location sharing: a passenger sharing their own
// position with their driver, gated by app_settings.passenger_location_sharing_enabled (off
// until the company is registered as a data controller — see docs/privacy-and-consent.md).
//
// It's a background listener, not tied to any one screen: for every upcoming ride the signed-in
// passenger has a CONFIRMED booking on, it quietly waits for the driver's first live-location
// update — the same signal that already means "the trip has started" — and only then asks
// "Allow the driver to see your location?" once. Saying yes starts sharing; it stops by itself
// once the driver ticks "Picked up", or the passenger stops it themselves. Nothing is asked, and
// nothing shares, unless the app is open at the moment the driver starts.
const BROADCAST_INTERVAL_MS = 5000

export interface PendingSharePrompt {
  rideId: string
  bookingId: string
  driverName: string
}

export function usePassengerLocationSharing(userId: string | null, enabled: boolean) {
  const [prompt, setPrompt] = useState<PendingSharePrompt | null>(null)
  const [sharingRideId, setSharingRideId] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)

  // Rides already asked about this session (said yes, said no, or are currently sharing) —
  // never re-prompt for the same ride once decided.
  const decidedRef = useRef(new Set<string>())
  // Listeners waiting for a driver's FIRST update, keyed by ride id, so they can be torn down
  // once that arrives (or the ride's no longer upcoming).
  const waitingRef = useRef(new Map<string, () => void>())

  const broadcasterRef = useRef<LocationBroadcaster | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const pickedUpWatchRef = useRef<(() => void) | null>(null)

  const stopSharing = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    broadcasterRef.current?.stop()
    broadcasterRef.current = null
    pickedUpWatchRef.current?.()
    pickedUpWatchRef.current = null
    setSharingRideId(null)
  }, [])

  const startSharing = useCallback(
    (rideId: string, bookingId: string) => {
      if (!userId || !navigator.geolocation) return
      stopSharing()
      decidedRef.current.add(rideId)
      setSharingRideId(rideId)
      setShareError(null)

      const broadcaster = createPassengerLocationBroadcaster(rideId, userId)
      broadcasterRef.current = broadcaster
      let lastSend = 0

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const now = Date.now()
          if (now - lastSend < BROADCAST_INTERVAL_MS) return
          lastSend = now
          broadcaster.send({ lat: position.coords.latitude, lng: position.coords.longitude })
        },
        (error) => {
          console.error('Passenger location watch error:', error)
          if (error.code === error.PERMISSION_DENIED) {
            stopSharing()
            setShareError('Location permission was denied.')
          }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
      )

      // Stops itself once the driver has this passenger in the car.
      pickedUpWatchRef.current = bookingsRepository.subscribeToBookingPickedUp(bookingId, stopSharing)
    },
    [userId, stopSharing]
  )

  const acceptPrompt = useCallback(() => {
    if (!prompt) return
    const { rideId, bookingId } = prompt
    setPrompt(null)
    startSharing(rideId, bookingId)
  }, [prompt, startSharing])

  const declinePrompt = useCallback(() => {
    if (!prompt) return
    decidedRef.current.add(prompt.rideId)
    setPrompt(null)
  }, [prompt])

  // Background listeners: one per upcoming confirmed booking, refreshed periodically since a
  // booking can become confirmed (or its ride can change) while the app is already open.
  useEffect(() => {
    if (!enabled || !userId) return
    let cancelled = false

    const refresh = async () => {
      let bookings
      try {
        bookings = await bookingsRepository.getBookingsForPassenger(userId)
      } catch (error) {
        console.error('Could not check for live trips to share location on:', error)
        return
      }
      if (cancelled) return

      const upcoming = bookings.filter(
        (b) => b.status === 'confirmed' && new Date(b.ride.departure_time).getTime() > Date.now()
      )
      const upcomingRideIds = new Set(upcoming.map((b) => b.ride.id))

      // Stop waiting on rides that are no longer upcoming/confirmed (booking cancelled, ride
      // departed) — nothing to prompt for there any more.
      for (const [rideId, stop] of waitingRef.current) {
        if (!upcomingRideIds.has(rideId)) {
          stop()
          waitingRef.current.delete(rideId)
        }
      }

      for (const booking of upcoming) {
        const rideId = booking.ride.id
        if (decidedRef.current.has(rideId) || waitingRef.current.has(rideId)) continue

        const stop = subscribeToDriverLocation(rideId, () => {
          // Only the FIRST update matters — it's the "a trip just started" signal.
          stop()
          waitingRef.current.delete(rideId)
          if (!cancelled && !decidedRef.current.has(rideId)) {
            setPrompt({ rideId, bookingId: booking.id, driverName: booking.ride.driver.full_name })
          }
        })
        waitingRef.current.set(rideId, stop)
      }
    }

    refresh()
    const interval = setInterval(refresh, 5 * 60 * 1000) // upcoming bookings rarely change; no need to poll often
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled, userId])

  // Nothing keeps running once the app itself is gone.
  useEffect(
    () => () => {
      for (const stop of waitingRef.current.values()) stop()
      waitingRef.current.clear()
      stopSharing()
    },
    [stopSharing]
  )

  return { prompt, sharingRideId, shareError, acceptPrompt, declinePrompt, stopSharing }
}
