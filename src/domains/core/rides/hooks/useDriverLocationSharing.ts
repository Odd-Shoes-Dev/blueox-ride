import { useState, useRef, useCallback } from 'react'
import { createLocationBroadcaster, type LocationBroadcaster } from '@/shared/services/database'

// Throttle GPS updates to one broadcast every 8s — frequent enough for a
// rider to see meaningful movement, far short of "every GPS tick" which
// would spam the Realtime channel for no benefit.
const BROADCAST_INTERVAL_MS = 8000

export function useDriverLocationSharing(rideId: string) {
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const broadcasterRef = useRef<LocationBroadcaster | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const lastSendRef = useRef(0)

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser')
      return
    }

    broadcasterRef.current = createLocationBroadcaster(rideId)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now()
        if (now - lastSendRef.current < BROADCAST_INTERVAL_MS) return
        lastSendRef.current = now

        broadcasterRef.current?.send({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          heading: position.coords.heading ?? undefined,
        })
      },
      (err) => {
        console.error('Geolocation watch error:', err)
        setError('Could not access your location. Please check permissions.')
        setSharing(false)
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    )

    setSharing(true)
    setError(null)
  }, [rideId])

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    broadcasterRef.current?.stop()
    broadcasterRef.current = null
    setSharing(false)
  }, [])

  return { sharing, error, start, stop }
}
