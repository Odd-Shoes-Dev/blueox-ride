import { useState, useEffect } from 'react'
import { subscribeToDriverLocation, type DriverLocationUpdate } from '@/shared/services/database'

// Subscribes to a ride's live driver-location broadcast while `enabled`.
// Returns the most recent update, or null if the driver hasn't shared one
// yet (or sharing is disabled).
export function useLiveDriverLocation(rideId: string, enabled: boolean): DriverLocationUpdate | null {
  const [location, setLocation] = useState<DriverLocationUpdate | null>(null)

  useEffect(() => {
    if (!enabled) return

    const unsubscribe = subscribeToDriverLocation(rideId, setLocation)
    return () => {
      unsubscribe()
      setLocation(null)
    }
  }, [rideId, enabled])

  return location
}
