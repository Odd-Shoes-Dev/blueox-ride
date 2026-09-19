import { useEffect } from 'react'
import { useOptionalMapShell, type PreviewableRide } from '@/domains/core/rides/map/MapShellContext'

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

export function formatDuration(min: number): string {
  return min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)}h ${Math.round(min % 60)}min`
}

// Shows a ride on the app's shared map instead of a second map inside the panel:
// its road route with pickup and drop-off pins. The route is a "previewed ride", so it STAYS on
// the map after the panel closes (the user clears it with the chip on the map).
// Returns the route's distance and time so the panel can show them as text.
export function useRideRouteOnMap(ride: PreviewableRide | null): { summary: { distanceKm: number; durationMin: number } | null; loading: boolean } {
  const shell = useOptionalMapShell()
  const previewRide = shell?.previewRide

  // Preview this ride once it has loaded (keyed on the id; the object is re-created on every fetch).
  const rideId = ride?.id
  useEffect(() => {
    if (ride) previewRide?.(ride)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId, previewRide])

  const mine = rideId !== undefined && shell?.featuredRideId === rideId
  return {
    summary: mine ? (shell?.featured?.summary ?? null) : null,
    loading: mine ? shell?.featuredStatus === 'loading' : rideId !== undefined,
  }
}
