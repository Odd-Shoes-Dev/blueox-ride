import { useEffect, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Navigation, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { getRoute } from '@/shared/services/routing'
import { MAP_TILE_URL, MAP_TILE_ATTRIBUTION, DEFAULT_MAP_CENTER } from '@/shared/services/maps'
import 'leaflet/dist/leaflet.css'

interface Location {
  lat: number
  lng: number
  name?: string
}

interface RouteInfo {
  distance: string
  distanceValue: number
  duration: string
  durationValue: number
}

interface DriverLocation {
  lat: number
  lng: number
  heading?: number
}

interface MapViewProps {
  origin?: Location | null
  destination?: Location | null
  onOriginChange?: (location: Location) => void
  onDestinationChange?: (location: Location) => void
  onRouteCalculated?: (info: RouteInfo) => void
  showRoute?: boolean
  interactive?: boolean
  height?: string
  className?: string
  driverLocation?: DriverLocation | null
}

// Custom marker icons
const createIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  })
}

const pickupIcon = createIcon('#FF4040') // coral
const dropoffIcon = createIcon('#193153') // navy

// Live driver position — a distinct pulsing dot rather than the teardrop pins,
// so it's immediately clear which marker is "moving" vs. the fixed endpoints.
const driverIcon = L.divIcon({
  className: 'driver-marker',
  html: `<div style="position: relative; width: 20px; height: 20px;">
    <div style="
      position: absolute; inset: 0;
      background-color: #3B82F6;
      border-radius: 50%;
      opacity: 0.3;
      animation: pulse 1.5s ease-out infinite;
    "></div>
    <div style="
      position: absolute; top: 4px; left: 4px; width: 12px; height: 12px;
      background-color: #3B82F6;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    "></div>
  </div>
  <style>
    @keyframes pulse {
      0% { transform: scale(0.8); opacity: 0.5; }
      100% { transform: scale(2.2); opacity: 0; }
    }
  </style>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

// Pans (without re-zooming) to follow the driver's live position as it updates.
function PanToDriver({ location }: { location: DriverLocation | null | undefined }) {
  const map = useMap()

  useEffect(() => {
    if (location) {
      map.panTo([location.lat, location.lng], { animate: true })
    }
  }, [map, location])

  return null
}

// Component to fit bounds when markers change
function FitBounds({ origin, destination }: { origin?: Location | null; destination?: Location | null }) {
  const map = useMap()

  useEffect(() => {
    const points: [number, number][] = []
    if (origin && origin.lat !== 0) {
      points.push([origin.lat, origin.lng])
    }
    if (destination && destination.lat !== 0) {
      points.push([destination.lat, destination.lng])
    }

    if (points.length > 0) {
      const bounds = L.latLngBounds(points)
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
    }
  }, [map, origin, destination])

  return null
}

export function MapView({
  origin,
  destination,
  onRouteCalculated,
  showRoute = true,
  height = '300px',
  className,
  driverLocation,
}: MapViewProps) {
  const [routePoints, setRoutePoints] = useState<[number, number][]>([])
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)
  const [loading, setLoading] = useState(false)

  const defaultCenter = DEFAULT_MAP_CENTER

  // Get map center
  const getCenter = (): [number, number] => {
    if (origin && origin.lat !== 0) {
      return [origin.lat, origin.lng]
    }
    if (destination && destination.lat !== 0) {
      return [destination.lat, destination.lng]
    }
    return defaultCenter
  }

  const calculateRoute = useCallback(async () => {
    if (!origin || !destination || origin.lat === 0 || destination.lat === 0) {
      setRoutePoints([])
      setRouteInfo(null)
      return
    }

    setLoading(true)

    try {
      const route = await getRoute(origin, destination)

      if (route) {
        setRoutePoints(route.polyline)

        const { distanceKm, durationMin } = route
        const info: RouteInfo = {
          distance: distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`,
          distanceValue: distanceKm,
          duration: durationMin < 60 ? `${Math.round(durationMin)} min` : `${Math.floor(durationMin / 60)}h ${Math.round(durationMin % 60)}min`,
          durationValue: durationMin,
        }

        setRouteInfo(info)
        onRouteCalculated?.(info)
      }
    } catch (error) {
      console.error('Route calculation error:', error)
      setRoutePoints([])
      setRouteInfo(null)
    } finally {
      setLoading(false)
    }
  }, [origin, destination, onRouteCalculated])

  // Calculate route when origin/destination change
  useEffect(() => {
    if (showRoute) {
      calculateRoute()
    }
  }, [showRoute, calculateRoute])

  const hasOrigin = origin && origin.lat !== 0
  const hasDestination = destination && destination.lat !== 0

  return (
    <div className={cn('relative rounded-lg overflow-hidden', className)} style={{ height }}>
      <MapContainer
        center={getCenter()}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <TileLayer attribution={MAP_TILE_ATTRIBUTION} url={MAP_TILE_URL} />

        {/* Origin marker */}
        {hasOrigin && (
          <Marker
            position={[origin.lat, origin.lng]}
            icon={pickupIcon}
          />
        )}

        {/* Destination marker */}
        {hasDestination && (
          <Marker
            position={[destination.lat, destination.lng]}
            icon={dropoffIcon}
          />
        )}

        {/* Route line */}
        {showRoute && routePoints.length > 0 && (
          <Polyline
            positions={routePoints}
            color="#FF4040"
            weight={4}
            opacity={0.8}
          />
        )}

        {/* Live driver position */}
        {driverLocation && (
          <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon} />
        )}

        {/* Fit bounds to markers */}
        <FitBounds origin={origin} destination={destination} />
        <PanToDriver location={driverLocation} />
      </MapContainer>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-coral-500" />
        </div>
      )}

      {/* Route info overlay */}
      {routeInfo && !loading && (
        <div className="absolute bottom-2 left-2 right-2 bg-background/95 backdrop-blur rounded-lg px-4 py-2 flex items-center justify-center gap-6 shadow-lg">
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
