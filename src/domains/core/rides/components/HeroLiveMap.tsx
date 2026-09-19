import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, ZoomControl, useMap, useMapEvents } from 'react-leaflet'
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
  // Move the map to this spot (e.g. a place picked in the hero's place search).
  // Pass a fresh object each time — the map flies whenever the object changes.
  focus?: { lat: number; lng: number } | null
  // Called with the map's centre each time it settles after a pan/zoom.
  onViewChange?: (center: { lat: number; lng: number }) => void
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

// Location quality. The first reading a device gives is often a rough guess
// (Wi-Fi / mobile tower / IP) that GPS then sharpens over the next seconds, so
// we keep listening briefly and only trust a reading as "the pickup" once it
// is accurate enough — or after a short deadline, whichever comes first.
const GOOD_ACCURACY_M = 100 // accurate enough to zoom to street level and use as the pickup
const DONE_ACCURACY_M = 25 // no point refining further
const REPORT_DEADLINE_MS = 6000 // report the best reading so far if it never gets "good"
const WATCH_MAX_MS = 20000 // stop listening (saves battery) after this long
const MIN_CIRCLE_M = 20 // below this the pulsing dot already says it all

// How far to zoom for a reading of the given accuracy (metres) — a 2 km-wide
// guess shouldn't be shown at street level.
function zoomForAccuracy(accuracy: number): number {
  if (accuracy <= GOOD_ACCURACY_M) return 18
  if (accuracy <= 500) return 16
  if (accuracy <= 2000) return 14
  return 12
}

// Stops "keep the map on my dot" once the user drags the map themselves.
function FollowBreaker({ onDrag }: { onDrag: () => void }) {
  useMapEvents({ dragstart: onDrag })
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

// Reports the map's centre whenever it settles, so callers (place search) can
// rank results near what the user is looking at. Callback only — no re-render.
function ViewReporter({ onChange }: { onChange?: (center: { lat: number; lng: number }) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter()
      onChange?.({ lat: c.lat, lng: c.lng })
    },
  })
  return null
}

const SEARCH_RESULT_ZOOM = 16

// Flies to a searched place. Only reacts when `focus` changes, so ordinary
// re-renders never yank the map back.
function FlyToFocus({ focus }: { focus: { lat: number; lng: number } | null }) {
  const map = useMap()
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], SEARCH_RESULT_ZOOM)
  }, [map, focus])
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
  focus = null,
  onViewChange,
  onEditConfirm,
  onEditCancel,
}: HeroLiveMapProps) {
  const navigate = useNavigate()
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null) // metres; drawn as a circle round the dot
  const [locating, setLocating] = useState(false) // true only while waiting for the first reading
  const [isCentered, setIsCentered] = useState(false)
  // State (not a ref) so PinPlacer can render once the map instance exists.
  const [map, setMap] = useState<L.Map | null>(null)

  // Refs, because these are read from long-lived geolocation callbacks.
  const mapRef = useRef<L.Map | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const followRef = useRef(true) // keep the map on the dot until the user drags it away
  const hasFixRef = useRef(false)
  const reportedRef = useRef({ any: false, accurate: false })
  const latestFixRef = useRef<{ coords: [number, number]; accuracy: number } | null>(null)
  const fallbackTriedRef = useRef(false)

  useEffect(() => {
    mapRef.current = map
  }, [map])

  const stopLocating = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  // Handles every reading: moves the dot, draws the accuracy, keeps the map on
  // it while following, and tells the parent when the reading is trustworthy.
  const applyFix = useCallback(
    (position: GeolocationPosition) => {
      const coords: [number, number] = [position.coords.latitude, position.coords.longitude]
      const acc = position.coords.accuracy
      const isFirst = !hasFixRef.current
      hasFixRef.current = true
      latestFixRef.current = { coords, accuracy: acc }

      setUserLocation(coords)
      setAccuracy(acc)
      setLocating(false)

      const m = mapRef.current
      if (m && followRef.current) {
        const targetZoom = zoomForAccuracy(acc)
        // First reading sets the view; later, sharper readings only ever zoom in.
        m.setView(coords, isFirst ? targetZoom : Math.max(m.getZoom(), targetZoom))
      }

      const report = () => onLocationFound?.({ lat: coords[0], lng: coords[1] })
      if (acc <= GOOD_ACCURACY_M && !reportedRef.current.accurate) {
        reportedRef.current = { any: true, accurate: true }
        report()
      }

      if (acc <= DONE_ACCURACY_M) stopLocating()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stopLocating]
  )

  // Starts (or restarts) a fresh, high-accuracy reading — never a cached one.
  const startLocating = useCallback(() => {
    if (!navigator.geolocation) {
      onLocationUnavailable?.()
      return
    }

    stopLocating()
    hasFixRef.current = false
    reportedRef.current = { any: false, accurate: false }
    fallbackTriedRef.current = false
    setLocating(true)

    watchIdRef.current = navigator.geolocation.watchPosition(
      applyFix,
      (error) => {
        if (hasFixRef.current && error.code !== error.PERMISSION_DENIED) return // keep the reading we have

        // No reading at all: some browsers/devices can't deliver high-accuracy
        // fixes, so try once more in low-accuracy mode before giving up.
        if (!fallbackTriedRef.current && error.code !== error.PERMISSION_DENIED) {
          fallbackTriedRef.current = true
          stopLocating()
          navigator.geolocation.getCurrentPosition(
            applyFix,
            () => {
              setLocating(false)
              onLocationUnavailable?.()
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60 * 1000 }
          )
          return
        }

        // Silent fallback to the default city view — this is decorative
        // backdrop, not a required permission for using the app.
        stopLocating()
        setLocating(false)
        onLocationUnavailable?.()
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )

    // If the reading never gets "good", still hand the parent the best one so far.
    timersRef.current.push(
      setTimeout(() => {
        const latest = latestFixRef.current
        if (latest && !reportedRef.current.any) {
          reportedRef.current = { any: true, accurate: latest.accuracy <= GOOD_ACCURACY_M }
          onLocationFound?.({ lat: latest.coords[0], lng: latest.coords[1] })
        }
      }, REPORT_DEADLINE_MS),
      setTimeout(stopLocating, WATCH_MAX_MS)
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyFix, stopLocating])

  useEffect(() => {
    startLocating()
    return stopLocating
  }, [startLocating, stopLocating])

  // Google-Maps-style "my location" button. Glide to the last known spot right
  // away, then take a fresh high-accuracy reading and follow it as it sharpens.
  const handleLocateClick = () => {
    followRef.current = true
    const latest = latestFixRef.current
    if (latest && map) map.flyTo(latest.coords, zoomForAccuracy(latest.accuracy))
    startLocating()
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
        center={DEFAULT_MAP_CENTER}
        zoom={DEFAULT_ZOOM}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <FollowBreaker onDrag={() => { followRef.current = false }} />
        <CenterWatcher target={userLocation} onChange={setIsCentered} />
        <FitToPins points={pinPoints} suspended={editing !== null} />
        <FlyToFocus focus={focus} />
        <ViewReporter onChange={onViewChange} />
        <ZoomControl position="bottomleft" />
        <TileLayer attribution={MAP_TILE_ATTRIBUTION} url={MAP_TILE_URL} />

        {/* How sure we are: the wider the circle, the rougher the reading. */}
        {userLocation && accuracy !== null && accuracy > MIN_CIRCLE_M && (
          <Circle
            center={userLocation}
            radius={accuracy}
            pathOptions={{ color: '#3B82F6', weight: 1, opacity: 0.5, fillColor: '#3B82F6', fillOpacity: 0.1, interactive: false }}
          />
        )}
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
