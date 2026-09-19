import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Polyline, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Locate, LocateFixed, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/shared/lib/utils'
import { MAP_TILE_URL, MAP_TILE_ATTRIBUTION, DEFAULT_MAP_CENTER } from '@/shared/services/maps'
import { Button } from '@/shared/ui/button'
import { PinPlacer, type PlacedPoint } from './PinPlacer'
import { PIN_COLORS, pinIcon, type PinKind } from './mapPins'
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
  // Pins for the trip being searched. Only shown when set; when `origin` is
  // null the user's own location dot stands in as the start of the route.
  origin?: PlacedPoint | null
  destination?: PlacedPoint | null
  // Which pin (if any) is currently being placed. While set, the map shows a
  // fixed centre pin that the user positions by moving the map, and nothing
  // changes until they confirm — taps on the map never move a saved pin.
  editing?: PinKind | null
  onEditConfirm?: (kind: PinKind, point: PlacedPoint) => void
  onEditCancel?: () => void
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

const CENTERED_THRESHOLD_METERS = 40 // closer than this to the user's dot counts as "centered on me"

// Reports whether the map's centre is still on the user's location, so the
// locate button can show its "centered" (blue) vs "you've moved away" state.
function CenterWatcher({
  target,
  onChange,
}: {
  target: [number, number] | null
  onChange: (isCentered: boolean) => void
}) {
  const map = useMapEvents({
    moveend: () => {
      if (!target) return onChange(false)
      onChange(map.distance(map.getCenter(), target) < CENTERED_THRESHOLD_METERS)
    },
  })
  return null
}

// Brings the trip's pin(s) into view when they change — flies to a single pin,
// or fits both ends of the route on screen. Paused while a pin is being placed
// so it doesn't fight the user's own panning.
function FitToPins({ points, suspended }: { points: [number, number][]; suspended: boolean }) {
  const map = useMap()
  const key = points.map((p) => p.join(',')).join('|')

  useEffect(() => {
    if (suspended || points.length === 0) return

    if (points.length === 1) {
      // After confirming a pin the map is already centred on it — don't re-fly.
      if (map.distance(map.getCenter(), points[0]) > 5) {
        map.flyTo(points[0], Math.max(map.getZoom(), 16))
      }
      return
    }

    // Leave room for the search card across the top and the corner buttons below.
    const size = map.getSize()
    map.flyToBounds(L.latLngBounds(points), {
      paddingTopLeft: [40, Math.min(320, size.y * 0.45)],
      paddingBottomRight: [40, 110],
      maxZoom: 16,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, suspended])

  return null
}

// A real, fully interactive map used as hero backdrop — shows the visitor's
// location (if granted) and nearby active rides at a glance. The header
// (logo, sign-in) and the search card render in a layer above this map
// (see HomePage's `relative z-10` wrapper), so they're never covered by it
// regardless of how the map is panned/zoomed. The zoom control and
// attribution are pinned to corners that stay clear of that content.
export function HeroLiveMap({
  rides,
  className,
  onLocationFound,
  onLocationUnavailable,
  origin = null,
  destination = null,
  editing = null,
  onEditConfirm,
  onEditCancel,
}: HeroLiveMapProps) {
  const navigate = useNavigate()
  const [center, setCenter] = useState<[number, number]>(DEFAULT_MAP_CENTER)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)
  const [isCentered, setIsCentered] = useState(false)
  // State (not a ref) so PinPlacer can render once the map instance exists.
  const [map, setMap] = useState<L.Map | null>(null)

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      onLocationUnavailable?.()
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: [number, number] = [position.coords.latitude, position.coords.longitude]
        setUserLocation(coords)
        setCenter(coords)
        setZoom(LOCATED_ZOOM)
        setLocating(false)
        onLocationFound?.({ lat: position.coords.latitude, lng: position.coords.longitude })
      },
      () => {
        // Silent fallback to the default city view — this is decorative
        // backdrop, not a required permission for using the app.
        setLocating(false)
        onLocationUnavailable?.()
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    requestLocation()
  }, [requestLocation])

  // Google-Maps-style "my location" button: fly back to the user's dot if we
  // know where it is, otherwise try to get their location again.
  const handleLocateClick = () => {
    if (userLocation && map) {
      map.flyTo(userLocation, LOCATED_ZOOM)
    } else {
      requestLocation()
    }
  }

  const nearbyRides = rides.filter((ride) => ride.origin_lat && ride.origin_lng).slice(0, 12)

  // The route's two ends. With no explicit pickup, the user's own dot is the start.
  const originPoint: [number, number] | null = origin ? [origin.lat, origin.lng] : null
  const destinationPoint: [number, number] | null = destination ? [destination.lat, destination.lng] : null
  const routeStart = originPoint ?? userLocation
  const pinPoints: [number, number][] = destinationPoint
    ? routeStart
      ? [routeStart, destinationPoint]
      : [destinationPoint]
    : originPoint
      ? [originPoint]
      : []

  // A pin being edited is represented by the fixed centre pin instead of its saved marker.
  const editingStart = editing === 'pickup' ? origin : editing === 'dropoff' ? destination : null

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
        ref={setMap}
        center={center}
        zoom={zoom}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <RecenterAndZoom center={center} zoom={zoom} />
        <CenterWatcher target={userLocation} onChange={setIsCentered} />
        <FitToPins points={pinPoints} suspended={editing !== null} />
        <ZoomControl position="bottomleft" />
        <TileLayer attribution={MAP_TILE_ATTRIBUTION} url={MAP_TILE_URL} />

        {userLocation && <Marker position={userLocation} icon={userIcon} />}

        {routeStart && destinationPoint && editing === null && (
          <Polyline
            positions={[routeStart, destinationPoint]}
            pathOptions={{ color: PIN_COLORS.dropoff, weight: 3, opacity: 0.7, dashArray: '6 8' }}
          />
        )}

        {originPoint && editing !== 'pickup' && (
          <Marker position={originPoint} icon={pinIcon('pickup')} interactive={false} zIndexOffset={1000} />
        )}
        {destinationPoint && editing !== 'dropoff' && (
          <Marker position={destinationPoint} icon={pinIcon('dropoff')} interactive={false} zIndexOffset={1000} />
        )}

        {nearbyRides.map((ride) => (
          <Marker
            key={ride.id}
            position={[ride.origin_lat, ride.origin_lng]}
            icon={rideIcon}
            opacity={editing ? 0.35 : 1}
          >
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

      {editing && map && (
        <PinPlacer
          key={editing}
          map={map}
          kind={editing}
          start={editingStart}
          onConfirm={(point) => onEditConfirm?.(editing, point)}
          onCancel={() => onEditCancel?.()}
        />
      )}

      {/* Sits above the hero's scroll-down button (bottom-right), clear of the
          map attribution. z-[1000] to sit above Leaflet's own panes/controls.
          Lifted while placing a pin so it clears the confirm bar. */}
      <button
        type="button"
        onClick={handleLocateClick}
        disabled={locating}
        aria-label="Go to my location"
        className={`absolute ${editing ? 'bottom-52' : 'bottom-24'} right-4 z-[1000] w-12 h-12 rounded-full flex items-center justify-center bg-white/80 hover:bg-white/90 border border-white/50 shadow-lg transition-colors`}
      >
        {locating ? (
          <Loader2 className="w-5 h-5 animate-spin text-navy-900" />
        ) : isCentered ? (
          <LocateFixed className="w-5 h-5 text-blue-500" />
        ) : (
          <Locate className="w-5 h-5 text-navy-900" />
        )}
      </button>
    </div>
  )
}
