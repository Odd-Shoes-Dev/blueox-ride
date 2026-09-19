import { supabase } from './client'
import type { Ride, User, Booking, CarPhoto, CreateRideRequest } from '@/shared/types'

export interface RideWithDriverRow extends Ride {
  driver_name: string
  driver_avatar: string | null
  driver_rating: number | null
  driver_total_rides?: number
  driver_phone?: string | null
  car_photo_url?: string | null
}

export interface RideSearchFilters {
  originName?: string
  destinationName?: string
  date?: string // 'YYYY-MM-DD'
  maxPrice?: number
  minSeats?: number
  limit?: number
}

// Backs both the homepage feed (no filters) and full search (all filters).
export async function searchActiveRides(filters: RideSearchFilters = {}): Promise<RideWithDriverRow[]> {
  let query = supabase
    .from('rides_with_driver')
    .select('*')
    .eq('status', 'active')
    .gt('departure_time', new Date().toISOString())
    .order('departure_time', { ascending: true })

  if (filters.minSeats) {
    query = query.gte('available_seats', filters.minSeats)
  }
  if (filters.originName) {
    query = query.ilike('origin_name', `%${filters.originName}%`)
  }
  if (filters.destinationName) {
    query = query.ilike('destination_name', `%${filters.destinationName}%`)
  }
  if (filters.date) {
    const startOfDay = new Date(filters.date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(filters.date)
    endOfDay.setHours(23, 59, 59, 999)
    query = query.gte('departure_time', startOfDay.toISOString()).lte('departure_time', endOfDay.toISOString())
  }
  if (filters.maxPrice) {
    query = query.lte('price', filters.maxPrice)
  }

  const { data, error } = await query.limit(filters.limit ?? 20)
  if (error) throw error
  return data as RideWithDriverRow[]
}

export interface NearPoint {
  lat: number
  lng: number
  radiusKm: number
}

// Degrees of latitude/longitude that span `km` around a point (good enough for a
// bounding box; the caller refines with an exact distance).
function boxDegrees(lat: number, km: number): { dLat: number; dLng: number } {
  return { dLat: km / 110.54, dLng: km / (111.32 * Math.max(0.1, Math.cos((lat * Math.PI) / 180))) }
}

// Active upcoming rides that start near `origin` and/or end near `destination`.
// Matches by location rather than by name, so differently-spelled places still find
// each other. This narrows to a box around each point in the database; the exact
// distance check and sorting happen in the app.
export async function searchRidesNear(filters: {
  origin?: NearPoint | null
  destination?: NearPoint | null
  date?: string // 'YYYY-MM-DD'
  limit?: number
}): Promise<RideWithDriverRow[]> {
  let query = supabase
    .from('rides_with_driver')
    .select('*')
    .eq('status', 'active')
    .gt('departure_time', new Date().toISOString())
    .order('departure_time', { ascending: true })

  if (filters.origin) {
    const { dLat, dLng } = boxDegrees(filters.origin.lat, filters.origin.radiusKm)
    query = query
      .gte('origin_lat', filters.origin.lat - dLat)
      .lte('origin_lat', filters.origin.lat + dLat)
      .gte('origin_lng', filters.origin.lng - dLng)
      .lte('origin_lng', filters.origin.lng + dLng)
  }
  if (filters.destination) {
    const { dLat, dLng } = boxDegrees(filters.destination.lat, filters.destination.radiusKm)
    query = query
      .gte('destination_lat', filters.destination.lat - dLat)
      .lte('destination_lat', filters.destination.lat + dLat)
      .gte('destination_lng', filters.destination.lng - dLng)
      .lte('destination_lng', filters.destination.lng + dLng)
  }
  if (filters.date) {
    const startOfDay = new Date(filters.date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(filters.date)
    endOfDay.setHours(23, 59, 59, 999)
    query = query.gte('departure_time', startOfDay.toISOString()).lte('departure_time', endOfDay.toISOString())
  }

  const { data, error } = await query.limit(filters.limit ?? 200)
  if (error) throw error
  return data as RideWithDriverRow[]
}

// A driver's own upcoming rides (soonest first) — used to show "your ride" on the map.
export async function getUpcomingRidesForDriver(driverId: string, limit = 5): Promise<RideWithDriverRow[]> {
  const { data, error } = await supabase
    .from('rides_with_driver')
    .select('*')
    .eq('driver_id', driverId)
    .in('status', ['active', 'full'])
    .gt('departure_time', new Date().toISOString())
    .order('departure_time', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data as RideWithDriverRow[]
}

export interface RideWithDriverDetail extends Ride {
  driver: User
  car_photo?: CarPhoto
}

export async function getRideWithDriver(rideId: string): Promise<RideWithDriverDetail | null> {
  const { data, error } = await supabase
    .from('rides')
    .select(`
      *,
      driver:users(*),
      car_photo:car_photos(*)
    `)
    .eq('id', rideId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as RideWithDriverDetail
}

export async function createRide(
  driverId: string,
  request: CreateRideRequest,
  carPhotoId: string | null
): Promise<Ride> {
  const { data, error } = await supabase
    .from('rides')
    .insert({
      driver_id: driverId,
      origin_name: request.origin_name,
      origin_lat: request.origin_lat,
      origin_lng: request.origin_lng,
      destination_name: request.destination_name,
      destination_lat: request.destination_lat,
      destination_lng: request.destination_lng,
      departure_time: request.departure_time,
      price: request.price,
      total_seats: request.total_seats,
      available_seats: request.total_seats,
      notes: request.notes || null,
      car_brand: request.car_brand || null,
      car_model: request.car_model || null,
      car_year: request.car_year || null,
      status: 'active',
      car_photo_id: carPhotoId,
    })
    .select()
    .single()

  if (error) throw error
  return data as Ride
}

export interface RideWithBookings extends Ride {
  bookings: (Booking & { passenger: User })[]
}

export async function getRidesForDriver(driverId: string): Promise<RideWithBookings[]> {
  const { data, error } = await supabase
    .from('rides')
    .select(`
      *,
      bookings:bookings(*, passenger:users(*))
    `)
    .eq('driver_id', driverId)
    .order('departure_time', { ascending: true })

  if (error) throw error
  return data as RideWithBookings[]
}

export async function cancelRide(rideId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('rides').update({ status: 'cancelled' }).eq('id', rideId)
  return { error: error as Error | null }
}

// Marks a ride and its confirmed bookings as completed, which is what
// unlocks reviews (the reviews table's RLS insert policy requires the
// booking to be 'completed'). Two updates rather than one RPC since both
// are already covered by existing RLS policies for the driver.
export async function markRideCompleted(rideId: string): Promise<{ error: Error | null }> {
  const { error: rideError } = await supabase
    .from('rides')
    .update({ status: 'completed' })
    .eq('id', rideId)

  if (rideError) return { error: rideError as Error }

  const { error: bookingsError } = await supabase
    .from('bookings')
    .update({ status: 'completed' })
    .eq('ride_id', rideId)
    .eq('status', 'confirmed')

  return { error: bookingsError as Error | null }
}
