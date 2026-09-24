import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Flag, Loader2, Minus, Plus, X } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'
import { formatDistance, formatDuration } from '@/domains/core/rides/hooks/useRideRouteOnMap'
import { haversineKm, measureRoute, progressAlongRoute } from '@/domains/core/rides/lib/routeProgress'
import type { LivePosition, LiveTrip } from '@/domains/core/rides/map/MapShellContext'

interface TripBarProps {
  trip: LiveTrip
  position: LivePosition | null
  route: { points: [number, number][]; summary: { distanceKm: number; durationMin: number } | null } | null
  error: string | null
  // Driver only: seats left, and a way to change them
  seats?: { available: number; total: number } | null
  onAdjustSeats?: (delta: number) => Promise<void>
  onStop: () => void
  className?: string
  // Passenger only: whether they're currently sharing their own position back, and a way to stop
  // (off, unless app_settings.passenger_location_sharing_enabled is on — see AppSettingsContext)
  passengerSharing?: boolean
  onStopSharingLocation?: () => void
}

const OFF_ROUTE_DRIVER_M = 200 // warn the driver they've left the planned road
const OFF_ROUTE_PASSENGER_M = 500 // beyond this the driver is "not on the route yet" (still heading to pickup)
const ARRIVED_KM = 0.15
const STALE_MS = 90_000 // a passenger's view of the driver older than this is flagged

// Re-renders every so often so "last updated N min ago" stays true without new data arriving.
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

// Live status for a trip on the map: how far is left, roughly how long, and whether
// the vehicle is off the planned route. Drivers get an "End trip" button; passengers
// can stop following. Sits over the map so it's visible with every panel closed.
export function TripBar({
  trip,
  position,
  route,
  error,
  seats,
  onAdjustSeats,
  onStop,
  className,
  passengerSharing,
  onStopSharingLocation,
}: TripBarProps) {
  const isDriver = trip.role === 'driver'
  const [seatBusy, setSeatBusy] = useState(false)
  const [seatError, setSeatError] = useState<string | null>(null)

  const changeSeats = async (delta: number) => {
    if (!onAdjustSeats) return
    setSeatBusy(true)
    setSeatError(null)
    try {
      await onAdjustSeats(delta)
    } catch (err) {
      setSeatError(err instanceof Error ? err.message : 'Could not change the seats')
    }
    setSeatBusy(false)
  }
  const now = useNow(15_000)
  const destination = trip.ride.destination_name

  const measure = useMemo(() => (route ? measureRoute(route.points) : null), [route])
  const progress =
    route && measure && route.summary && position
      ? progressAlongRoute(route.points, measure, position, route.summary.durationMin)
      : null

  const staleMinutes =
    !isDriver && position && now - position.updatedAt > STALE_MS
      ? Math.round((now - position.updatedAt) / 60000)
      : null

  const arrived = progress !== null && progress.remainingKm <= ARRIVED_KM && progress.fractionDone > 0.5
  const offRoute = progress !== null && progress.offRouteMeters > (isDriver ? OFF_ROUTE_DRIVER_M : OFF_ROUTE_PASSENGER_M)

  // A passenger whose driver is still far from the route is waiting on the way to the pickup.
  const toPickupKm =
    !isDriver && position && offRoute
      ? haversineKm(position, { lat: trip.ride.origin_lat, lng: trip.ride.origin_lng })
      : null

  let headline: React.ReactNode
  if (!position) {
    headline = (
      <span className="flex items-center gap-2 text-navy-900/70">
        <Loader2 className="w-4 h-4 animate-spin" />
        {isDriver ? 'Finding your position…' : 'Waiting for the driver to start sharing…'}
      </span>
    )
  } else if (arrived) {
    headline = (
      <span className="flex items-center gap-2 font-semibold text-green-700">
        <Flag className="w-4 h-4" />
        {isDriver ? "You've arrived" : 'The driver has arrived'}
        {destination ? ` at ${destination}` : ''}
      </span>
    )
  } else if (toPickupKm !== null) {
    headline = <span className="font-semibold">Driver is {formatDistance(toPickupKm)} from the pickup</span>
  } else if (progress) {
    headline = (
      <span className="font-semibold">
        {formatDistance(progress.remainingKm)} left · ~{formatDuration(progress.etaMin)}
      </span>
    )
  } else {
    headline = <span className="text-navy-900/70">{route ? 'Working out progress…' : 'Loading the route…'}</span>
  }

  return (
    <div
      className={cn(
        'pointer-events-auto w-full max-w-md rounded-2xl bg-white/95 border border-white/50 shadow-xl px-4 py-3 text-navy-900',
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-navy-900/70">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          {isDriver ? 'Trip in progress' : 'Following the driver'}
        </div>

        {isDriver ? (
          <Button type="button" size="sm" variant="outline" className="h-8 bg-white text-navy-900 border-navy-200" onClick={onStop}>
            End trip
          </Button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop following the driver"
            className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="mt-1 text-base">{headline}</div>

      {isDriver && !error && <p className="mt-0.5 text-xs text-navy-900/60">Sharing live with your passengers · screen stays on</p>}
      {!isDriver && passengerSharing && (
        <button
          type="button"
          onClick={onStopSharingLocation}
          className="mt-0.5 text-xs text-navy-900/60 underline decoration-navy-900/30 hover:text-navy-900"
        >
          Sharing your location with the driver — Stop
        </button>
      )}
      {staleMinutes !== null && (
        <p className="mt-0.5 text-xs text-navy-900/60">Driver's position last updated {staleMinutes} min ago</p>
      )}
      {isDriver && offRoute && progress && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5" />
          You're {formatDistance(progress.offRouteMeters / 1000)} off the planned route
        </p>
      )}
      {error && <p className="mt-1 text-xs text-amber-700">{error}</p>}

      {/* The driver keeps the seat count true: tap − when someone gets in on the road */}
      {isDriver && seats && (
        <div className="mt-2 pt-2 border-t border-navy-900/10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-navy-900/80">Seats left</p>
            <p className="text-[11px] text-navy-900/50">Picked someone up on the road? Tap −</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 bg-white text-navy-900 border-navy-200"
              disabled={seatBusy || seats.available <= 0}
              onClick={() => changeSeats(-1)}
              aria-label="One fewer seat left"
            >
              <Minus className="w-4 h-4" />
            </Button>
            <span className="w-12 text-center font-semibold">
              {seats.available}/{seats.total}
            </span>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 bg-white text-navy-900 border-navy-200"
              disabled={seatBusy || seats.available >= seats.total}
              onClick={() => changeSeats(1)}
              aria-label="One more seat left"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
      {seatError && <p className="mt-1 text-xs text-red-700">{seatError}</p>}
    </div>
  )
}
