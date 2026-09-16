import { useState, useEffect, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Button } from '@/components/ui/button'
import { X, Calendar, Users, Loader2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import 'leaflet/dist/leaflet.css'

interface Location {
  lat: number
  lng: number
  name: string
}

interface RideWithRoute {
  id: string
  origin_name: string
  origin_lat: number
  origin_lng: number
  destination_name: string
  destination_lat: number
  destination_lng: number
  departure_time: string
  price: number
  available_seats: number
  driver_name?: string
  route?: [number, number][]
}

interface RidesMapViewProps {
  isOpen: boolean
  onClose: () => void
  rides: RideWithRoute[]
  userOrigin?: Location | null
  userDestination?: Location | null
  onRideSelect?: (rideId: string) => void
}

// Custom marker icons
const createIcon = (color: string, size: number = 24) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: ${size}px;
      height: ${size}px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  })
}

const userIcon = L.divIcon({
  className: 'user-marker',
  html: `<div style="
    background-color: #3B82F6;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(59,130,246,0.5);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

// Random colors for different rides
const rideColors = [
  '#FF4040', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899',
  '#06B6D4', '#84CC16', '#F97316', '#6366F1', '#14B8A6'
]

// Component to fit all rides in view
function FitAllRides({ rides, userOrigin }: { rides: RideWithRoute[]; userOrigin?: Location | null }) {
  const map = useMap()

  useEffect(() => {
    const points: [number, number][] = []

    rides.forEach(ride => {
      if (ride.origin_lat && ride.origin_lng) {
        points.push([ride.origin_lat, ride.origin_lng])
      }
      if (ride.destination_lat && ride.destination_lng) {
        points.push([ride.destination_lat, ride.destination_lng])
      }
    })

    if (userOrigin) {
      points.push([userOrigin.lat, userOrigin.lng])
    }

    if (points.length > 0) {
      const bounds = L.latLngBounds(points)
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 })
    }
  }, [map, rides, userOrigin])

  return null
}

export function RidesMapView({
  isOpen,
  onClose,
  rides,
  userOrigin,
  userDestination: _userDestination,
  onRideSelect,
}: RidesMapViewProps) {
  const [ridesWithRoutes, setRidesWithRoutes] = useState<RideWithRoute[]>(rides)
  const [loading, setLoading] = useState(false)
  const [selectedRide, setSelectedRide] = useState<string | null>(null)

  // Default center (Kampala, Uganda)
  const defaultCenter: [number, number] = [0.3476, 32.5825]

  // Fetch route for a ride using OSRM
  const fetchRoute = useCallback(async (ride: RideWithRoute): Promise<[number, number][] | null> => {
    if (!ride.origin_lat || !ride.destination_lat) return null

    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${ride.origin_lng},${ride.origin_lat};${ride.destination_lng},${ride.destination_lat}?overview=full&geometries=geojson`
      )

      if (!response.ok) return null

      const data = await response.json()

      if (data.routes && data.routes.length > 0) {
        return data.routes[0].geometry.coordinates.map(
          (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
        )
      }
    } catch (error) {
      console.error('Route fetch error:', error)
    }

    return null
  }, [])

  // Fetch routes for all rides
  useEffect(() => {
    if (!isOpen || rides.length === 0) return

    const fetchAllRoutes = async () => {
      setLoading(true)

      const updatedRides = await Promise.all(
        rides.map(async (ride) => {
          if (ride.route) return ride // Already has route

          const route = await fetchRoute(ride)
          return { ...ride, route: route || undefined }
        })
      )

      setRidesWithRoutes(updatedRides)
      setLoading(false)
    }

    fetchAllRoutes()
  }, [isOpen, rides, fetchRoute])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button onClick={onClose} className="p-2 -ml-2 hover:bg-muted rounded-full">
            <X className="w-5 h-5" />
          </button>
          <h2 className="font-semibold">Available Rides Map</h2>
          <div className="w-9" />
        </div>
      </div>

      {/* Map */}
      <div className="absolute inset-0 pt-14 pb-0">
        <MapContainer
          center={userOrigin ? [userOrigin.lat, userOrigin.lng] : defaultCenter}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitAllRides rides={ridesWithRoutes} userOrigin={userOrigin} />

          {/* User's current location */}
          {userOrigin && (
            <Marker position={[userOrigin.lat, userOrigin.lng]} icon={userIcon}>
              <Popup>
                <div className="text-sm font-medium">Your location</div>
              </Popup>
            </Marker>
          )}

          {/* Rides */}
          {ridesWithRoutes.map((ride, index) => {
            const color = rideColors[index % rideColors.length]
            const isSelected = selectedRide === ride.id
            const originIcon = createIcon(color, isSelected ? 28 : 20)
            const destIcon = createIcon('#193153', isSelected ? 24 : 16)

            return (
              <div key={ride.id}>
                {/* Route line */}
                {ride.route && ride.route.length > 0 && (
                  <Polyline
                    positions={ride.route}
                    color={color}
                    weight={isSelected ? 5 : 3}
                    opacity={isSelected ? 1 : 0.6}
                  />
                )}

                {/* Origin marker */}
                {ride.origin_lat && ride.origin_lng && (
                  <Marker
                    position={[ride.origin_lat, ride.origin_lng]}
                    icon={originIcon}
                    eventHandlers={{
                      click: () => setSelectedRide(ride.id === selectedRide ? null : ride.id),
                    }}
                  >
                    <Popup>
                      <div className="min-w-[200px]">
                        <p className="font-semibold text-sm mb-1">{ride.origin_name}</p>
                        <p className="text-xs text-muted-foreground mb-2">→ {ride.destination_name}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(ride.departure_time)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {ride.available_seats} seats
                          </span>
                        </div>
                        <p className="font-bold text-coral-500 mb-2">{formatCurrency(ride.price)}</p>
                        {onRideSelect && (
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={() => onRideSelect(ride.id)}
                          >
                            View Details
                          </Button>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                )}

                {/* Destination marker (smaller) */}
                {ride.destination_lat && ride.destination_lng && (
                  <Marker
                    position={[ride.destination_lat, ride.destination_lng]}
                    icon={destIcon}
                  />
                )}
              </div>
            )
          })}
        </MapContainer>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] bg-background/90 backdrop-blur px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-coral-500" />
            <span className="text-sm">Loading routes...</span>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-background/95 backdrop-blur rounded-lg p-3 shadow-lg">
          <p className="text-xs font-medium mb-2">Legend</p>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow" />
              <span>Your location</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-coral-500 border border-white shadow" />
              <span>Ride pickup</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-navy-900 border border-white shadow" />
              <span>Drop-off</span>
            </div>
          </div>
        </div>

        {/* Ride count */}
        <div className="absolute top-20 right-4 z-[1000] bg-background/95 backdrop-blur px-3 py-2 rounded-lg shadow-lg">
          <p className="text-sm font-medium">{ridesWithRoutes.length} rides</p>
        </div>
      </div>
    </div>
  )
}
