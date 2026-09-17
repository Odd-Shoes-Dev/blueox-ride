// Internal adapter for OSRM (routing). Nothing outside shared/services/routing
// should know the vendor is OSRM — callers use the normalized function/type
// exported from ./index.ts.

export interface RoutePoint {
  lat: number
  lng: number
}

export interface RouteResult {
  polyline: [number, number][] // [lat, lng] pairs
  distanceKm: number
  durationMin: number
}

export async function getRoute(origin: RoutePoint, destination: RoutePoint): Promise<RouteResult | null> {
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`
  )

  if (!response.ok) {
    throw new Error('OSRM routing failed')
  }

  const data = await response.json()

  if (!data.routes || data.routes.length === 0) {
    return null
  }

  const route = data.routes[0]
  const polyline: [number, number][] = route.geometry.coordinates.map(
    (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
  )

  return {
    polyline,
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
  }
}
