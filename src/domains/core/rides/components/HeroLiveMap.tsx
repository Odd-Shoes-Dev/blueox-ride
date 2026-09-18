import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import { formatCurrency } from '@/shared/lib/utils'
import { MAP_TILE_URL, MAP_TILE_ATTRIBUTION, DEFAULT_MAP_CENTER } from '@/shared/services/maps'
import { Button } from '@/shared/ui/button'
import 'leaflet/dist/leaflet.css'

interface HeroRide {
  id: string
  origin_name: string
  origin_lat: number
  origin_lng: number
  price: number
}

interface HeroLiveMapProps {
  rides: HeroRide[]
  className?: string
  onLocationFound?: (coords: { lat: number; lng: number }) => void
  onLocationUnavailable?: () => void
}

const rideIcon = L.divIcon({
  className: 'hero-ride-marker',
  html: `<div style="
    background-color: #FF4040;
    width: 20px;
    height: 20px;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    border: 2px solid white;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 20],
})

const userIcon = L.divIcon({
  className: 'hero-user-marker',
  html: `<div style="position: relative; width: 18px; height: 18px;">
    <div style="
      position: absolute; inset: 0;
      background-color: #3B82F6;
      border-radius: 50%;
      opacity: 0.35;
      animation: hero-pulse 1.8s ease-out infinite;
    "></div>
    <div style="
      position: absolute; top: 4px; left: 4px; width: 10px; height: 10px;
      background-color: #3B82F6;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    "></div>
  </div>
  <style>
    @keyframes hero-pulse {
      0% { transform: scale(0.8); opacity: 0.5; }
      100% { transform: scale(2.4); opacity: 0; }
    }
  </style>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

const DEFAULT_ZOOM = 12 // city-wide view, used until we know exactly where the visitor is
const LOCATED_ZOOM = 18 // close street-level, like Google Maps opens to once it has your position

// react-leaflet's `center`/`zoom` props on MapContainer only set the
// *initial* view — changing them later doesn't move an already-mounted map.
// This re-centers/re-zooms it once geolocation resolves.
function RecenterAndZoom({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom)
  }, [map, center, zoom])
  return null
}

// A real, fully interactive map used as hero backdrop — shows the visitor's
// location (if granted) and nearby active rides at a glance. The header
// (logo, sign-in) and the search card render in a layer above this map
// (see HomePage's `relative z-10` wrapper), so they're never covered by it
// regardless of how the map is panned/zoomed. The zoom control and
// attribution are pinned to corners that stay clear of that content.
export function HeroLiveMap({ rides, className, onLocationFound, onLocationUnavailable }: HeroLiveMapProps) {
  const navigate = useNavigate()
  const [center, setCenter] = useState<[number, number]>(DEFAULT_MAP_CENTER)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      onLocationUnavailable?.()
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude]
        setUserLocation(coords)
        setCenter(coords)
        setZoom(LOCATED_ZOOM)
        onLocationFound?.({ lat: position.coords.latitude, lng: position.coords.longitude })
      },
      () => {
        // Silent fallback to the default city view — this is decorative
        // backdrop, not a required permission for using the app.
        onLocationUnavailable?.()
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nearbyRides = rides.filter((ride) => ride.origin_lat && ride.origin_lng).slice(0, 12)

  return (
    // Positioning lives on this plain wrapper, not on the Leaflet container
    // itself — Leaflet's own stylesheet sets `.leaflet-container { position:
    // relative }`, and depending on CSS load order that can silently beat
    // our `absolute inset-0` utility on the same element (equal specificity,
    // last rule in the cascade wins). A wrapper div with no Leaflet class on
    // it can't lose that fight because there's no competing rule to begin
    // with, so the map reliably stays behind the floating UI on top of it.
    <div className={className} style={{ zIndex: 0 }}>
      <MapContainer
        center={center}
        zoom={zoom}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <RecenterAndZoom center={center} zoom={zoom} />
        <ZoomControl position="bottomleft" />
        <TileLayer attribution={MAP_TILE_ATTRIBUTION} url={MAP_TILE_URL} />

        {userLocation && <Marker position={userLocation} icon={userIcon} />}

        {nearbyRides.map((ride) => (
          <Marker key={ride.id} position={[ride.origin_lat, ride.origin_lng]} icon={rideIcon}>
            <Popup>
              <div className="text-sm">
                <p className="font-medium mb-1">{ride.origin_name}</p>
                <p className="text-muted-foreground mb-2">{formatCurrency(ride.price)}/seat</p>
                <Button size="sm" className="w-full" onClick={() => navigate(`/rides/${ride.id}`)}>
                  View Ride
                </Button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
