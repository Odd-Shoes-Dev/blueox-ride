import { supabase } from './client'
import type { RideRequest, PostRideRequestInput, AcceptRideRequestInput } from '@/shared/types'

export async function createRideRequest(
  passengerId: string,
  input: PostRideRequestInput
): Promise<RideRequest> {
  const { data, error } = await supabase
    .from('ride_requests')
    .insert({
      passenger_id: passengerId,
      origin_name: input.origin_name,
      origin_lat: input.origin_lat,
      origin_lng: input.origin_lng,
      destination_name: input.destination_name,
      destination_lat: input.destination_lat,
      destination_lng: input.destination_lng,
      departure_time: input.departure_time,
      budget: input.budget,
      seats_needed: input.seats_needed,
      notes: input.notes || null,
    })
    .select()
    .single()

  if (error) throw error
  return data as RideRequest
}

// Open requests are for signed-in users only (migration 14). The passenger join is deliberately
// narrow — a name and photo are enough for browsing; phone and email are only ever shared once
// a driver actually accepts, the same as for any other booking.
export async function getOpenRideRequests(): Promise<RideRequest[]> {
  const { data, error } = await supabase
    .from('ride_requests')
    .select('*, passenger:users(id, full_name, avatar_url, average_rating, total_rides)')
    .eq('status', 'open')
    .gt('departure_time', new Date().toISOString())
    .order('departure_time', { ascending: true })
    .limit(50)

  if (error) throw error
  return data as RideRequest[]
}

export async function getMyRideRequests(passengerId: string): Promise<RideRequest[]> {
  const { data, error } = await supabase
    .from('ride_requests')
    .select('*')
    .eq('passenger_id', passengerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as RideRequest[]
}

export async function cancelRideRequest(requestId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('ride_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)

  return { error: error as Error | null }
}

// Atomically creates a ride + booking for the request via the
// accept_ride_request() RPC and marks the request matched. Returns the new
// ride id (the driver's own ride, to navigate to). See
// supabase/migrations/07_ride_requests.sql for the function.
export async function acceptRideRequest(
  requestId: string,
  input: AcceptRideRequestInput
): Promise<string> {
  const { data, error } = await supabase.rpc('accept_ride_request', {
    p_request_id: requestId,
    p_departure_time: input.departure_time,
    p_price: input.price,
    p_car_brand: input.car_brand ?? null,
    p_car_model: input.car_model ?? null,
    p_car_year: input.car_year ?? null,
    p_car_photo_id: input.car_photo_id ?? null,
  })

  if (error) throw error
  return data as string
}
