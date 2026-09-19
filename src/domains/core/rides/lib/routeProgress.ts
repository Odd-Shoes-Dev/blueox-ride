// Where a moving vehicle is along a drawn route: how far is left, roughly how long
// that will take, and whether it has strayed off the road the route follows.
// Pure functions — no map or network involved.

export type LatLng = { lat: number; lng: number }

const EARTH_RADIUS_KM = 6371

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

export interface RouteMeasure {
  cumulativeKm: number[] // distance from the start to each point
  totalKm: number
}

// Do this once per route (it walks every point), then reuse it for every GPS fix.
export function measureRoute(points: [number, number][]): RouteMeasure {
  const cumulativeKm: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const prev = { lat: points[i - 1][0], lng: points[i - 1][1] }
    const next = { lat: points[i][0], lng: points[i][1] }
    cumulativeKm.push(cumulativeKm[i - 1] + haversineKm(prev, next))
  }
  return { cumulativeKm, totalKm: cumulativeKm[cumulativeKm.length - 1] ?? 0 }
}

export interface RouteProgress {
  remainingKm: number
  etaMin: number
  // How far the position is from the nearest point on the route (metres)
  offRouteMeters: number
  fractionDone: number
}

// Snap `position` to the nearest spot on the route and read off what's left.
// Time left is the route's own estimated duration scaled by the share still to
// drive — steady and simple, rather than reacting to every change in speed.
export function progressAlongRoute(
  points: [number, number][],
  measure: RouteMeasure,
  position: LatLng,
  totalDurationMin: number
): RouteProgress | null {
  if (points.length < 2 || measure.totalKm <= 0) return null

  // Work in metres around the position (fine over the short distances involved).
  const mPerDegLat = 110540
  const mPerDegLng = 111320 * Math.cos((position.lat * Math.PI) / 180)

  let bestDistM = Infinity
  let bestAlongKm = 0

  for (let i = 0; i < points.length - 1; i++) {
    const ax = (points[i][1] - position.lng) * mPerDegLng
    const ay = (points[i][0] - position.lat) * mPerDegLat
    const bx = (points[i + 1][1] - position.lng) * mPerDegLng
    const by = (points[i + 1][0] - position.lat) * mPerDegLat

    const dx = bx - ax
    const dy = by - ay
    const lengthSq = dx * dx + dy * dy
    // Where along this segment (0..1) is closest to the position (the origin here)
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq))
    const cx = ax + t * dx
    const cy = ay + t * dy
    const distM = Math.hypot(cx, cy)

    if (distM < bestDistM) {
      bestDistM = distM
      bestAlongKm = measure.cumulativeKm[i] + t * (measure.cumulativeKm[i + 1] - measure.cumulativeKm[i])
    }
  }

  const remainingKm = Math.max(0, measure.totalKm - bestAlongKm)
  const fractionDone = Math.min(1, bestAlongKm / measure.totalKm)
  return {
    remainingKm,
    etaMin: totalDurationMin * (remainingKm / measure.totalKm),
    offRouteMeters: bestDistM,
    fractionDone,
  }
}
