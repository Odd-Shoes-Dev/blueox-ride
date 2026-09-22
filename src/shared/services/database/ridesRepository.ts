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

// Change a ride's "seats left" by hand (delta of -1 = someone got in, +1 = a seat freed up).
// Returns the new number of seats left. The database refuses to go below 0 or above the total.
export async function adjustSeats(rideId: string, delta: number): Promise<number> {
  const { data, error } = await supabase.rpc('adjust_ride_seats', { p_ride_id: rideId, p_delta: delta })
  if (error) throw error
  return data as number
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

export interface RideForEdit extends Ride {
  // Whether the ride can be edited in full. False once it has a live booking or the driver has
  // already adjusted its seats — matched by the database trigger that enforces this
  // (guard_ride_edit, migration 13), so this is only ever a prediction of what the server will
  // accept, not the source of truth.
  fullyEditable: boolean
}

export async function getRideForEdit(rideId: string): Promise<RideForEdit | null> {
  const { data: ride, error } = await supabase.from('rides').select('*').eq('id', rideId).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  const { count, error: countError } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('ride_id', rideId)
    .neq('status', 'cancelled')
  if (countError) throw countError

  const untouched = (ride as Ride).available_seats === (ride as Ride).total_seats
  return { ...(ride as Ride), fullyEditable: untouched && (count ?? 0) === 0 }
}

export interface RideEditRequest {
  origin_name: string
  origin_lat: number
  origin_lng: number
  destination_name: string
  destination_lat: number
  destination_lng: number
  departure_time: string
  price: number
  total_seats: number
  notes?: string | null
  car_brand?: string | null
  car_model?: string | null
  car_year?: number | null
  car_photo_id?: string | null
}

type AlwaysEditableRideFields = 'notes' | 'car_brand' | 'car_model' | 'car_year' | 'car_photo_id'

// Notes and car details always go through; the rest is only accepted by the database
// (guard_ride_edit) while nothing has taken a seat on the ride yet — see getRideForEdit.
export async function updateRide(
  rideId: string,
  updates: RideEditRequest | Pick<RideEditRequest, AlwaysEditableRideFields>
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('rides').update(updates).eq('id', rideId)
  return { error: error as Error | null }
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
