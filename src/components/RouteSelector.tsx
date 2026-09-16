import { useState, useCallback } from 'react'
import { LocationPicker } from './LocationPicker'
import { MapView } from './MapView'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Navigation, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Location {
  lat: number
  lng: number
  name: string
}

interface RouteInfo {
  distance: string
  distanceValue: number
  duration: string
  durationValue: number
}

interface RouteSelectorProps {
  origin: Location | null
  destination: Location | null
  onOriginChange: (location: Location | null) => void
  onDestinationChange: (location: Location | null) => void
  onRouteCalculated?: (info: RouteInfo | null) => void
  className?: string
}

export function RouteSelector({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onRouteCalculated,
  className,
}: RouteSelectorProps) {
  const [showMap, setShowMap] = useState(false)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)

  const handleRouteCalculated = useCallback((info: RouteInfo) => {
    setRouteInfo(info)
    onRouteCalculated?.(info)
  }, [onRouteCalculated])

  // Handle map pin changes
  const handleMapOriginChange = useCallback((loc: { lat: number; lng: number; name?: string }) => {
    onOriginChange({
      lat: loc.lat,
      lng: loc.lng,
      name: loc.name || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`,
    })
  }, [onOriginChange])

  const handleMapDestinationChange = useCallback((loc: { lat: number; lng: number; name?: string }) => {
    onDestinationChange({
      lat: loc.lat,
      lng: loc.lng,
      name: loc.name || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`,
    })
  }, [onDestinationChange])

  const hasValidOrigin = !!(origin && origin.lat !== 0 && origin.lng !== 0)
  const hasValidDestination = !!(destination && destination.lat !== 0 && destination.lng !== 0)
  const canShowRoute = hasValidOrigin && hasValidDestination

  return (
    <div className={cn('space-y-3', className)}>
      {/* Location inputs */}
      <div className="space-y-3">
        <LocationPicker
          value={origin}
          onChange={onOriginChange}
          placeholder="Pickup location"
          markerColor="pickup"
        />
        <LocationPicker
          value={destination}
          onChange={onDestinationChange}
          placeholder="Drop-off location"
          markerColor="dropoff"
        />
      </div>

      {/* Map toggle button (shown when both locations are set) */}
      {canShowRoute && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowMap(!showMap)}
          className="w-full flex items-center justify-center gap-2"
        >
          {showMap ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Hide Map
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show Route on Map
            </>
          )}
        </Button>
      )}

      {/* Map view */}
      {showMap && (
        <MapView
          origin={hasValidOrigin ? origin : null}
          destination={hasValidDestination ? destination : null}
          onOriginChange={handleMapOriginChange}
          onDestinationChange={handleMapDestinationChange}
          onRouteCalculated={handleRouteCalculated}
          showRoute={canShowRoute}
          interactive={true}
          height="250px"
        />
      )}

      {/* Route info summary (shown when map is hidden but route exists) */}
      {!showMap && routeInfo && canShowRoute && (
        <div className="flex items-center justify-center gap-6 py-3 px-4 bg-muted rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <Navigation className="w-4 h-4 text-coral-500" />
            <span className="font-medium">{routeInfo.distance}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>~{routeInfo.duration}</span>
          </div>
        </div>
      )}
    </div>
  )
}
