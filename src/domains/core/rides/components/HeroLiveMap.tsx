import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  destination_name?: string
  origin_lat: number
  origin_lng: number
  price: number
}

interface HeroRideRequest {
  id: string
  origin_name: string
  destination_name: string
  origin_lat: number
  origin_lng: number
  budget: number
  seats_needed: number
}

interface HeroLiveMapProps {
  rides: HeroRide[]
  // The signed-in driver's own upcoming rides: shown with a different marker
  myRides?: HeroRide[]
  // Open ride requests (people who want a ride, not drivers offering one), shown while the
  // Ride Requests page is open. Tapping one calls onSelectRequest with its id.
  requests?: HeroRideRequest[]
  onSelectRequest?: (requestId: string) => void
  // Confirmed passengers currently sharing their own position back, shown to the driver during
  // their own live trip (see usePassengerLocationSharing / useLiveTrip's passengerPositions).
  passengers?: { id: string; name: string; lat: number; lng: number }[]
  // A ride's road route (own next ride, or the pin the user tapped) with its end pin
  featured?: {
    rideId: string
    points: [number, number][]
    origin: { lat: number; lng: number }
    destination: { lat: number; lng: number }
    summary: { distanceKm: number; durationMin: number } | null
    fit: boolean
  } | null
  onSelectRide?: (rideId: string) => void
  onDeselectRide?: (rideId: string) => void
  // Zoom the map to show all these points whenever `token` changes (e.g. search results)
  fitPoints?: { points: [number, number][]; token: number } | null
  className?: string
  onLocationFound?: (coords: { lat: number; lng: number }) => void
  onLocationUnavailable?: () => void
  // Pins for the trip being searched. Only shown when set; when `origin` is
  // null the user's own location dot stands in as the start of the route.
  origin?: PlacedPoint | null
  destination?: PlacedPoint | null
  // A live vehicle position to show and follow, how close to zoom when it first appears,
  // and whether to hide the user's own dot (while they are the one driving, the car is them).
  driver?: { lat: number; lng: number; heading?: number } | null
  driverZoom?: number
  hideUserLocation?: boolean
  // Which pin (if any) is currently being placed. While set, the map shows a
  // fixed centre pin that the user positions by moving the map, and nothing
  // changes until they confirm — taps on the map never move a saved pin.
  editing?: { kind: PinKind; start: PlacedPoint | null } | null
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

// The driver's own ride: navy pin with a star, so it stands out from other people's coral pins.
const myRideIcon = L.divIcon({
  className: 'hero-my-ride-marker',
  html: `<div style="
    background-color: #193153;
    width: 26px;
    height: 26px;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    border: 2px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.35);
    display: flex; align-items: center; justify-content: center;
  "><span style="transform: rotate(45deg); color: white; font-size: 13px; line-height: 1;">★</span></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
})

// An open ride request: hollow, dashed and amber, so it reads as "wanted" rather than
// "offered" (rideIcon is a solid coral pin) at a glance.
const requestIcon = L.divIcon({
  className: 'hero-request-marker',
  html: `<div style="
    width: 22px;
    height: 22px;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    background: white;
    border: 2.5px dashed #D97706;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
  "><span style="transform: rotate(45deg); color: #D97706; font-size: 12px; font-weight: 700; line-height: 1;">?</span></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
})

// A passenger currently sharing their own position back, shown to the driver during a trip as a
// small avatar — same visual language as the initials avatars used elsewhere in the app (My
// Rides' passenger list, the corner account button). `name` is someone's own profile name, so it
// goes through a strict allow-list (letters/digits only) before it ever reaches raw HTML — not
// just escaped, restricted, since this is the only marker that interpolates user-controlled text.
function makePassengerIcon(name: string): L.DivIcon {
  const initials = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2) || '?'
  return L.divIcon({
    className: 'hero-passenger-marker',
    html: `<div style="
      width: 28px; height: 28px; border-radius: 50%;
      background: #FFEDD5;
      border: 2.5px solid white;
      box-shadow: 0 2px 5px rgba(0,0,0,0.35);
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; color: #193153;
    ">${initials}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

// The two ends of a previewed ride's route. Small dots, so they don't get confused with the
// searcher's own pickup/destination pins (which are shown at the same time).
const rideStartIcon = L.divIcon({
  className: 'hero-ride-end',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:white;border:3px solid #FF4040;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})
const rideEndIcon = L.divIcon({
  className: 'hero-ride-end',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#FF4040;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
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

// The vehicle being tracked, drawn like a navigation arrow: it points the way the vehicle is
// heading (rotated by `heading`, in degrees from north). Until a direction is known —
// stationary at the start — it is a plain pulsing dot, then turns into the arrow once moving.
function makeDriverIcon(heading: number | null): L.DivIcon {
  const arrow =
    heading === null
      ? `<div style="position:relative;width:22px;height:22px;">
           <div style="position:absolute;inset:0;border-radius:50%;background:#2563EB;opacity:.3;animation:driver-pulse 1.8s ease-out infinite;"></div>
           <div style="position:absolute;top:4px;left:4px;width:14px;height:14px;border-radius:50%;background:#2563EB;border:3px solid white;box-shadow:0 1px 5px rgba(0,0,0,.45);"></div>
           <style>@keyframes driver-pulse { 0% { transform: scale(.8); opacity: .5; } 100% { transform: scale(2.4); opacity: 0; } }</style>
         </div>`
      : `<div style="width:44px;height:44px;transform:rotate(${heading}deg);">
           <svg width="44" height="44" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,.45));">
             <circle cx="22" cy="22" r="19" fill="#2563EB" opacity=".18"/>
             <path d="M22 6 L34 36 L22 29.5 L10 36 Z" fill="#2563EB" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
           </svg>
         </div>`
  const size = heading === null ? 22 : 44
  return L.divIcon({
    className: 'hero-driver-marker',
    html: arrow,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

const DEFAULT_ZOOM = 12 // city-wide view, used until we know exactly where the visitor is

// Location: two requests run at once. A QUICK one (Wi-Fi / mobile towers, or the phone's
// very recent position) usually answers in a second or two but may be rough; a PRECISE one
// (GPS) is exact but can take 10-30 s on a phone that hasn't used GPS lately. The quick answer
// puts a dot on the map straight away (with its accuracy circle) and GPS then sharpens it.
const GOOD_ACCURACY_M = 100 // accurate enough to zoom to street level and stop saying "refining"
const DONE_ACCURACY_M = 25 // no point refining further
const QUICK_TIMEOUT_MS = 5000
const QUICK_MAX_AGE_MS = 30_000 // a phone reading up to this old is fine for a first guess
const PRECISE_TIMEOUT_MS = 30_000 // cold GPS starts can be slow, especially indoors
const WATCH_MAX_MS = 30_000 // stop listening (saves battery) after this long
const MIN_CIRCLE_M = 20 // below this the pulsing dot already says it all

// How far to zoom for a reading of the given accuracy (metres) — a 2 km-wide
// guess shouldn't be shown at street level.
function zoomForAccuracy(accuracy: number): number {
  if (accuracy <= GOOD_ACCURACY_M) return 18
  if (accuracy <= 500) return 16
  if (accuracy <= 2000) return 14
  return 12
}

// The map's box changes size when a side panel / bottom sheet opens or closes
// (see MapShell). Leaflet only notices window resizes, so watch the container
// itself and tell Leaflet — it keeps the same point at the middle of the new box.
function ResizeSync() {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [map])
  return null
}

// Follows a live vehicle. When it first appears the map zooms in (if asked to) and starts
// following; each update then pans to it. Dragging the map stops the following, and
// the locate button turns it back on.
function PanToDriver({
  driver,
  zoom,
  followRef,
}: {
  driver: { lat: number; lng: number } | null
  zoom?: number
  followRef: React.MutableRefObject<boolean>
}) {
  const map = useMap()
  const hadDriverRef = useRef(false)

  useEffect(() => {
    if (!driver) {
      hadDriverRef.current = false
      return
    }
    if (!hadDriverRef.current) {
      hadDriverRef.current = true
      if (zoom) {
        // The driver's own trip: zoom in on themselves and keep following.
        followRef.current = true
        map.setView([driver.lat, driver.lng], Math.max(map.getZoom(), zoom))
      } else {
        // A passenger watching: leave the map showing the whole route; no chasing the car.
        followRef.current = false
      }
      return
    }
    if (followRef.current) map.panTo([driver.lat, driver.lng], { animate: true })
  }, [map, driver, zoom, followRef])

  return null
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

// Frames a set of points (search results plus the trip's ends) each time `token` changes.
function FitToPoints({ points, token }: { points: [number, number][]; token: number | null }) {
  const map = useMap()
  useEffect(() => {
    if (token === null || points.length === 0) return
    if (points.length === 1) {
      map.flyTo(points[0], Math.max(map.getZoom(), 14))
      return
    }
    map.flyToBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 15 })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, token])
  return null
}

// Zooms to a previewed ride's whole route (only when the user tapped that ride's pin —
// the driver's own route just draws, without moving the map away from where they are).
function FitToRoute({
  routeKey,
  points,
  extra,
  active,
}: {
  routeKey: string | null
  points: [number, number][]
  // The searcher's own trip ends: kept in frame too, so previewing a ride doesn't lose them
  extra: [number, number][]
  active: boolean
}) {
  const map = useMap()
  useEffect(() => {
    if (!active || points.length < 2) return
    const size = map.getSize()
    map.flyToBounds(L.latLngBounds([...points, ...extra]), {
      paddingTopLeft: [40, Math.min(320, size.y * 0.45)],
      paddingBottomRight: [40, 110],
      maxZoom: 16,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routeKey, active])
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

// Popup for a ride pin: where it goes, the price, and — once its route has loaded —
// how far and how long.
function RidePopup({
  ride,
  title,
  featured,
  onView,
}: {
  ride: HeroRide
  title?: string
  featured: HeroLiveMapProps['featured']
  onView: () => void
}) {
  const summary = featured?.rideId === ride.id ? featured.summary : null
  const distance = summary
    ? summary.distanceKm < 1
      ? `${Math.round(summary.distanceKm * 1000)} m`
      : `${summary.distanceKm.toFixed(1)} km`
    : null
  return (
    <div className="text-sm">
      {title && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>}
      <p className="font-medium">{ride.origin_name}</p>
      {ride.destination_name && <p className="text-muted-foreground mb-1">to {ride.destination_name}</p>}
      <p className="text-muted-foreground mb-2">
        {formatCurrency(ride.price)}/seat
        {summary && ` · ${distance} · ~${Math.round(summary.durationMin)} min`}
      </p>
      <Button size="sm" className="w-full" onClick={onView}>
        View Ride
      </Button>
    </div>
  )
}

// Popup for an open-request pin: where they want to go, their budget, and an Accept button
// that hands off to the caller (RideRequestsPage owns the actual accept dialog/flow).
function RideRequestPopup({ request, onAccept }: { request: HeroRideRequest; onAccept: () => void }) {
  return (
    <div className="text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-1">Wants a ride</p>
      <p className="font-medium">{request.origin_name}</p>
      <p className="text-muted-foreground mb-1">to {request.destination_name}</p>
      <p className="text-muted-foreground mb-2">
        {formatCurrency(request.budget)}/seat · {request.seats_needed} seat{request.seats_needed !== 1 ? 's' : ''}
      </p>
      <Button size="sm" className="w-full" onClick={onAccept}>
        Accept
      </Button>
    </div>
  )
}

// A real, fully interactive map used as hero backdrop — shows the visitor's
// location (if granted) and nearby active rides at a glance. The header
// (logo, sign-in) and the search card render in a layer above this map
// (see HomePage's `relative z-10` wrapper), so they're never covered by it
// regardless of how the map is panned/zoomed. The zoom control and
// attribution are pinned to corners that stay clear of that content.
export function HeroLiveMap({
  rides,
  myRides = [],
  requests = [],
  passengers = [],
  onSelectRequest,
  featured = null,
  onSelectRide,
  onDeselectRide,
  fitPoints = null,
  className,
  onLocationFound,
  onLocationUnavailable,
  origin = null,
  destination = null,
  driver = null,
  driverZoom,
  hideUserLocation = false,
  editing = null,
  focus = null,
  onViewChange,
  onEditConfirm,
  onEditCancel,
}: HeroLiveMapProps) {
  const navigate = useNavigate()
  // Always call the *latest* callbacks: the geolocation handlers below are created
  // once, so closing over the props directly would freeze the first render's copies
  // (and any state they read) for the life of the map.
  const onLocationFoundRef = useRef(onLocationFound)
  const onLocationUnavailableRef = useRef(onLocationUnavailable)
  useEffect(() => {
    onLocationFoundRef.current = onLocationFound
    onLocationUnavailableRef.current = onLocationUnavailable
  })
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null) // metres; drawn as a circle round the dot
  const [locating, setLocating] = useState(false) // true only while waiting for the first reading
  const [refining, setRefining] = useState(false) // a rough position is showing; GPS is still sharpening it
  const [isCentered, setIsCentered] = useState(false)
  // State (not a ref) so PinPlacer can render once the map instance exists.
  const [map, setMap] = useState<L.Map | null>(null)

  // Refs, because these are read from long-lived geolocation callbacks.
  const mapRef = useRef<L.Map | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const followRef = useRef(true) // keep the map on the dot until the user drags it away
  const driverFollowRef = useRef(true) // likewise for a live vehicle being followed
  const hasFixRef = useRef(false)
  const reportedRef = useRef({ any: false, accurate: false })
  const latestFixRef = useRef<{ coords: [number, number]; accuracy: number } | null>(null)
  const bestAccuracyRef = useRef(Infinity)
  const quickFailedRef = useRef(false)
  const preciseFailedRef = useRef(false)

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
    setRefining(false)
  }, [])

  // Handles every reading: moves the dot, draws the accuracy, keeps the map on
  // it while following, and tells the parent about it.
  const applyFix = useCallback(
    (position: GeolocationPosition, quick = false) => {
      const coords: [number, number] = [position.coords.latitude, position.coords.longitude]
      const acc = position.coords.accuracy

      // A slow rough answer that arrives after a better one must not drag the dot backwards.
      if (quick && hasFixRef.current && acc >= bestAccuracyRef.current) return

      const isFirst = !hasFixRef.current
      hasFixRef.current = true
      bestAccuracyRef.current = Math.min(bestAccuracyRef.current, acc)
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

      // Tell the parent right away — however rough — so the search card and pickup are ready
      // without waiting for GPS; and again once the reading is accurate, so the pickup improves.
      const report = () => onLocationFoundRef.current?.({ lat: coords[0], lng: coords[1] })
      if (!reportedRef.current.any) {
        reportedRef.current.any = true
        report()
      }
      if (acc <= GOOD_ACCURACY_M) {
        if (!reportedRef.current.accurate) {
          reportedRef.current.accurate = true
          report()
        }
        setRefining(false)
      }

      if (acc <= DONE_ACCURACY_M) stopLocating()
    },
    [stopLocating]
  )

  // Starts (or restarts) a fresh reading: the quick and the precise request together.
  const startLocating = useCallback(() => {
    if (!navigator.geolocation) {
      onLocationUnavailableRef.current?.()
      return
    }

    stopLocating()
    hasFixRef.current = false
    reportedRef.current = { any: false, accurate: false }
    bestAccuracyRef.current = Infinity
    quickFailedRef.current = false
    preciseFailedRef.current = false
    setLocating(true)
    setRefining(true)

    const giveUp = () => {
      // Silent fallback to the default city view — this is decorative
      // backdrop, not a required permission for using the app.
      stopLocating()
      setLocating(false)
      onLocationUnavailableRef.current?.()
    }

    const onError = (which: 'quick' | 'precise') => (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        giveUp()
        return
      }
      if (which === 'quick') quickFailedRef.current = true
      else preciseFailedRef.current = true

      if (!hasFixRef.current && quickFailedRef.current && preciseFailedRef.current) giveUp()
      // GPS never sharpened the rough position we already have — stop saying it's working on it.
      else if (hasFixRef.current && which === 'precise') setRefining(false)
    }

    navigator.geolocation.getCurrentPosition((position) => applyFix(position, true), onError('quick'), {
      enableHighAccuracy: false,
      maximumAge: QUICK_MAX_AGE_MS,
      timeout: QUICK_TIMEOUT_MS,
    })

    watchIdRef.current = navigator.geolocation.watchPosition((position) => applyFix(position, false), onError('precise'), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: PRECISE_TIMEOUT_MS,
    })

    timersRef.current.push(setTimeout(stopLocating, WATCH_MAX_MS))
  }, [applyFix, stopLocating])

  useEffect(() => {
    // Deferred a tick so the effect body itself sets no state; cancelled on cleanup.
    const id = setTimeout(startLocating, 0)
    return () => {
      clearTimeout(id)
      stopLocating()
    }
  }, [startLocating, stopLocating])

  // Google-Maps-style "my location" button. Glide to the last known spot right
  // away, then take a fresh high-accuracy reading and follow it as it sharpens.
  const handleLocateClick = () => {
    // While following a vehicle (a live trip), "my location" means the vehicle.
    if (driver && map) {
      driverFollowRef.current = true
      map.flyTo([driver.lat, driver.lng], Math.max(map.getZoom(), driverZoom ?? 15))
      return
    }
    followRef.current = true
    const latest = latestFixRef.current
    if (latest && map) map.flyTo(latest.coords, zoomForAccuracy(latest.accuracy))
    startLocating()
  }

  // Rebuild the arrow only when it turns by a noticeable amount (5° steps), not on every GPS tick.
  const driverHeadingStep = driver?.heading == null ? null : Math.round(driver.heading / 5) * 5
  const driverIcon = useMemo(() => makeDriverIcon(driverHeadingStep), [driverHeadingStep])

  const myRideIds = new Set(myRides.map((ride) => ride.id))
  const nearbyRides = rides
    .filter((ride) => ride.origin_lat && ride.origin_lng && !myRideIds.has(ride.id))
    .slice(0, 12)

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
  const editingKind = editing?.kind ?? null

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
        <FollowBreaker
          onDrag={() => {
            followRef.current = false
            driverFollowRef.current = false
          }}
        />
        <CenterWatcher target={userLocation} onChange={setIsCentered} />
        <ResizeSync />
        <FitToPins points={pinPoints} suspended={editing !== null} />
        <ResizeSync />
        <FitToPoints points={fitPoints?.points ?? []} token={fitPoints?.token ?? null} />
        <FlyToFocus focus={focus} />
        <ViewReporter onChange={onViewChange} />
        <ZoomControl position="bottomleft" />
        <TileLayer attribution={MAP_TILE_ATTRIBUTION} url={MAP_TILE_URL} />

        {/* How sure we are: the wider the circle, the rougher the reading. */}
        {!hideUserLocation && userLocation && accuracy !== null && accuracy > MIN_CIRCLE_M && (
          <Circle
            center={userLocation}
            radius={accuracy}
            pathOptions={{ color: '#3B82F6', weight: 1, opacity: 0.5, fillColor: '#3B82F6', fillOpacity: 0.1, interactive: false }}
          />
        )}
        {!hideUserLocation && userLocation && <Marker position={userLocation} icon={userIcon} />}

        {featured && featured.points.length > 1 && editingKind === null && (
          <>
            <Polyline positions={featured.points} pathOptions={{ color: '#FF4040', weight: 5, opacity: 0.85 }} />
            <Marker
              position={[featured.origin.lat, featured.origin.lng]}
              icon={rideStartIcon}
              interactive={false}
              zIndexOffset={700}
            />
            <Marker
              position={[featured.destination.lat, featured.destination.lng]}
              icon={rideEndIcon}
              interactive={false}
              zIndexOffset={900}
            />
          </>
        )}
        <FitToRoute routeKey={featured?.rideId ?? null} points={featured?.points ?? []} extra={pinPoints} active={!!featured?.fit} />

        {routeStart && destinationPoint && editingKind === null && (
          <Polyline
            positions={[routeStart, destinationPoint]}
            pathOptions={{ color: PIN_COLORS.dropoff, weight: 3, opacity: 0.7, dashArray: '6 8' }}
          />
        )}

        {driver && <Marker position={[driver.lat, driver.lng]} icon={driverIcon} zIndexOffset={1500} interactive={false} />}
        <PanToDriver driver={driver} zoom={driverZoom} followRef={driverFollowRef} />

        {originPoint && editingKind !== 'pickup' && (
          <Marker position={originPoint} icon={pinIcon('pickup')} interactive={false} zIndexOffset={1000} />
        )}
        {destinationPoint && editingKind !== 'dropoff' && (
          <Marker position={destinationPoint} icon={pinIcon('dropoff')} interactive={false} zIndexOffset={1000} />
        )}

        {myRides
          .filter((ride) => ride.origin_lat && ride.origin_lng)
          .map((ride) => (
            <Marker
              key={`mine-${ride.id}`}
              position={[ride.origin_lat, ride.origin_lng]}
              icon={myRideIcon}
              zIndexOffset={800}
              opacity={editingKind ? 0.35 : 1}
              eventHandlers={{ click: () => onSelectRide?.(ride.id), popupclose: () => onDeselectRide?.(ride.id) }}
            >
              <Popup>
                <RidePopup ride={ride} title="Your ride" featured={featured} onView={() => navigate(`/rides/${ride.id}`)} />
              </Popup>
            </Marker>
          ))}

        {nearbyRides.map((ride) => (
          <Marker
            key={ride.id}
            position={[ride.origin_lat, ride.origin_lng]}
            icon={rideIcon}
            opacity={editingKind ? 0.35 : 1}
            eventHandlers={{ click: () => onSelectRide?.(ride.id), popupclose: () => onDeselectRide?.(ride.id) }}
          >
            <Popup>
              <RidePopup ride={ride} featured={featured} onView={() => navigate(`/rides/${ride.id}`)} />
            </Popup>
          </Marker>
        ))}

        {requests
          .filter((request) => request.origin_lat && request.origin_lng)
          .map((request) => (
            <Marker
              key={`req-${request.id}`}
              position={[request.origin_lat, request.origin_lng]}
              icon={requestIcon}
              opacity={editingKind ? 0.35 : 1}
              zIndexOffset={600}
            >
              <Popup>
                <RideRequestPopup request={request} onAccept={() => onSelectRequest?.(request.id)} />
              </Popup>
            </Marker>
          ))}

        {passengers.map((passenger) => (
          <Marker
            key={`pax-${passenger.id}`}
            position={[passenger.lat, passenger.lng]}
            icon={makePassengerIcon(passenger.name)}
            zIndexOffset={1200}
          >
            <Popup>
              <p className="text-sm font-medium">{passenger.name}</p>
              <p className="text-xs text-muted-foreground">Sharing their location</p>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {editing && map && (
        <PinPlacer
          key={editing.kind}
          map={map}
          kind={editing.kind}
          start={editing.start}
          onConfirm={(point) => onEditConfirm?.(editing.kind, point)}
          onCancel={() => onEditCancel?.()}
        />
      )}

      {/* A rough position is already showing; GPS is still making it exact */}
      {refining && userLocation && !editing && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none flex items-center gap-2 rounded-full bg-white/90 border border-white/50 shadow-lg px-3 py-1.5 text-xs text-navy-900 whitespace-nowrap">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Getting a more exact position…
        </div>
      )}

      {/* Sits above the hero's scroll-down button (bottom-right), clear of the
          map attribution. z-[1000] to sit above Leaflet's own panes/controls.
          Lifted while placing a pin so it clears the confirm bar. */}
      <button
        type="button"
        onClick={handleLocateClick}
        disabled={locating}
        aria-label="Go to my location"
        className={`absolute ${editingKind ? 'bottom-52' : 'bottom-24'} right-4 z-[1000] w-12 h-12 rounded-full flex items-center justify-center bg-white/80 hover:bg-white/90 border border-white/50 shadow-lg transition-colors`}
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
