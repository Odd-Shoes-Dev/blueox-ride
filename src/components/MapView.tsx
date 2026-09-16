import { useEffect, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Navigation, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
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
}: MapViewProps) {
  const [routePoints, setRoutePoints] = useState<[number, number][]>([])
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)
  const [loading, setLoading] = useState(false)

  // Default center (Uganda)
  const defaultCenter: [number, number] = [0.3476, 32.5825]

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

  // Calculate route using OSRM (free routing service)
  const calculateRoute = useCallback(async () => {
    if (!origin || !destination || origin.lat === 0 || destination.lat === 0) {
      setRoutePoints([])
      setRouteInfo(null)
      return
    }

    setLoading(true)

    try {
      // Use OSRM public API for routing
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`
      )

      if (!response.ok) {
        throw new Error('Routing API error')
      }

      const data = await response.json()

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0]

        // Extract route geometry
        const coordinates = route.geometry.coordinates.map(
          (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
        )
        setRoutePoints(coordinates)

        // Calculate distance and duration
        const distanceKm = route.distance / 1000
        const durationMin = route.duration / 60

        const info: RouteInfo = {
          distance: distanceKm < 1 ? `${Math.round(route.distance)} m` : `${distanceKm.toFixed(1)} km`,
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
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

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

        {/* Fit bounds to markers */}
        <FitBounds origin={origin} destination={destination} />
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
