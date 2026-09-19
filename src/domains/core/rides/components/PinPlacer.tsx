import { useEffect, useState } from 'react'
import type L from 'leaflet'
import { Loader2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { reverseGeocode } from '@/shared/services/geocoding'
import { PIN_COLORS, pinSvg, type PinKind } from './mapPins'

export interface PlacedPoint {
  lat: number
  lng: number
  name: string
}

interface PinPlacerProps {
  map: L.Map
  kind: PinKind
  // Where the pin currently is, if it has been set before — the map opens there.
  start: PlacedPoint | null
  onConfirm: (point: PlacedPoint) => void
  onCancel: () => void
}

const MIN_EDIT_ZOOM = 17
const SAME_SPOT_METERS = 3
const GEOCODE_DEBOUNCE_MS = 300

const LABELS: Record<PinKind, string> = {
  pickup: 'Set pickup point',
  dropoff: 'Set destination',
}

// Places a pin by moving the map under a fixed centre pin (the Uber/Google
// "set location on map" pattern). Nothing is saved until Confirm, and taps on
// the map do nothing, so a stray touch can't change a location — the only way
// to move the pin is the deliberate gesture of dragging the map.
export function PinPlacer({ map, kind, start, onConfirm, onCancel }: PinPlacerProps) {
  const [coords, setCoords] = useState<[number, number]>(() => {
    if (start) return [start.lat, start.lng]
    const c = map.getCenter()
    return [c.lat, c.lng]
  })
  const [resolved, setResolved] = useState<PlacedPoint | null>(start)
  const [moving, setMoving] = useState(false)

  // Open on the pin's current spot (or zoom in on where the map already is).
  useEffect(() => {
    if (start) {
      map.setView([start.lat, start.lng], Math.max(map.getZoom(), MIN_EDIT_ZOOM))
    } else if (map.getZoom() < 15) {
      map.setZoom(16)
    }
  // Only on entering edit mode — `start` is the value at that moment.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])

  // The map's centre is the pin's position: lift the pin while it moves, settle it when it stops.
  useEffect(() => {
    const onMoveStart = () => setMoving(true)
    const onMoveEnd = () => {
      setMoving(false)
      const c = map.getCenter()
      setCoords([c.lat, c.lng])
    }
    map.on('movestart', onMoveStart)
    map.on('moveend', onMoveEnd)
    return () => {
      map.off('movestart', onMoveStart)
      map.off('moveend', onMoveEnd)
    }
  }, [map])

  // Look up the address for wherever the pin settled (debounced; skipped if unchanged).
  useEffect(() => {
    if (resolved && map.distance([resolved.lat, resolved.lng], coords) < SAME_SPOT_METERS) return

    let cancelled = false
    const [lat, lng] = coords
    const timer = setTimeout(() => {
      reverseGeocode(lat, lng)
        .catch(() => `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
        .then((name) => {
          if (!cancelled) setResolved({ lat, lng, name })
        })
    }, GEOCODE_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [coords, resolved, map])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const addressReady = resolved !== null && map.distance([resolved.lat, resolved.lng], coords) < SAME_SPOT_METERS
  const busy = moving || !addressReady

  const handleConfirm = () => {
    if (busy || !resolved) return
    onConfirm({ lat: coords[0], lng: coords[1], name: resolved.name })
  }

  return (
    <>
      {/* Fixed centre pin: its tip sits exactly on the map's centre point. */}
      <div className="absolute left-1/2 top-1/2 z-[1000] pointer-events-none">
        <div
          className="absolute rounded-full bg-black/30 transition-all duration-150"
          style={{
            width: moving ? 14 : 10,
            height: moving ? 8 : 6,
            left: moving ? -7 : -5,
            top: moving ? -4 : -3,
            opacity: moving ? 0.5 : 0.8,
          }}
        />
        <div
          className="absolute left-0 top-0 transition-transform duration-150 ease-out"
          style={{ transform: `translate(-50%, calc(-100% - ${moving ? 14 : 0}px))` }}
          dangerouslySetInnerHTML={{ __html: pinSvg(kind, 44) }}
        />
      </div>

      {/* Confirm bar. Wrapper is click-through so only the card itself blocks the map. */}
      <div className="absolute bottom-6 inset-x-4 z-[1000] pointer-events-none">
        <div className="max-w-md mx-auto pointer-events-auto rounded-2xl bg-white/90 border border-white/50 shadow-xl p-4 text-navy-900">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-navy-900/70">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIN_COLORS[kind] }} />
            {LABELS[kind]}
          </div>

          <div className="mt-1.5 min-h-[2.5rem]">
            {busy ? (
              <p className="flex items-center gap-2 text-sm text-navy-900/60">
                <Loader2 className={`w-4 h-4 ${moving ? '' : 'animate-spin'}`} />
                {moving ? 'Move the map to place the pin' : 'Finding address...'}
              </p>
            ) : (
              <>
                <p className="text-sm font-medium truncate">{resolved?.name}</p>
                <p className="text-xs text-navy-900/60">
                  {coords[0].toFixed(5)}, {coords[1].toFixed(5)}
                </p>
              </>
            )}
          </div>

          <div className="flex gap-2 mt-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1 bg-white text-navy-900 border-navy-200 hover:bg-navy-50 hover:text-navy-900"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button type="button" className="flex-1" disabled={busy} onClick={handleConfirm}>
              Confirm
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
