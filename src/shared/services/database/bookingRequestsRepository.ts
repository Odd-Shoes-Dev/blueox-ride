import { supabase } from './client'
import type { BookingRequest, DeclineReason, Ride, User } from '@/shared/types'

// A place a passenger picked for getting in or off (the ride's own start/end when omitted).
export interface StopInput {
  name: string
  lat: number
  lng: number
}

export interface RequestBookingParams {
  rideId: string
  seats: number
  // What they offer to pay per seat, in UGX
  offer: number
  pickup?: StopInput | null
  dropoff?: StopInput | null
  churchId: string | null
}

// Send a driver a request for a seat. The database enforces the rules (3 requests per
// ride, a retry must change something, one waiting at a time, ...) and the error message
// says which one was hit. Returns the new request's id.
export async function requestBooking(params: RequestBookingParams): Promise<string> {
  const { data, error } = await supabase.rpc('request_booking', {
    p_ride_id: params.rideId,
    p_seats: params.seats,
    p_offer: params.offer,
    p_pickup_name: params.pickup?.name ?? null,
    p_pickup_lat: params.pickup?.lat ?? null,
    p_pickup_lng: params.pickup?.lng ?? null,
    p_dropoff_name: params.dropoff?.name ?? null,
    p_dropoff_lat: params.dropoff?.lat ?? null,
    p_dropoff_lng: params.dropoff?.lng ?? null,
    p_church_id: params.churchId,
  })

  if (error) throw error
  return data as string
}

export async function withdrawRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('withdraw_booking_request', { p_request_id: requestId })
  if (error) throw error
}

export type RequestOutcome = 'accepted' | 'declined' | 'expired'

// Driver: accept a request (which books the passenger), or refuse it with a reason.
export async function respondToRequest(
  requestId: string,
  response: { accept: true } | { accept: false; reason: DeclineReason; block: boolean }
): Promise<RequestOutcome> {
  const { data, error } = await supabase.rpc('respond_to_booking_request', {
    p_request_id: requestId,
    p_accept: response.accept,
    p_reason: response.accept ? null : response.reason,
    p_block: response.accept ? false : response.block,
  })

  if (error) throw error
  return data as RequestOutcome
}

export type BookingRequestWithDetails = BookingRequest & { passenger: User; ride: Ride }

const WITH_DETAILS = '*, passenger:users!passenger_id(*), ride:rides(*)'

// Requests sent to a driver about their rides, newest first.
export async function getRequestsForDriver(driverId: string): Promise<BookingRequestWithDetails[]> {
  const { data, error } = await supabase
    .from('booking_requests')
    .select(WITH_DETAILS)
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return data as BookingRequestWithDetails[]
}

// Requests a passenger has sent, newest first.
export async function getRequestsForPassenger(passengerId: string): Promise<BookingRequestWithDetails[]> {
  const { data, error } = await supabase
    .from('booking_requests')
    .select(WITH_DETAILS)
    .eq('passenger_id', passengerId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return data as BookingRequestWithDetails[]
}

// A passenger's requests on one ride, newest first (to know how many attempts are left).
export async function getMyRequestsForRide(rideId: string, passengerId: string): Promise<BookingRequest[]> {
  const { data, error } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('ride_id', rideId)
    .eq('passenger_id', passengerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as BookingRequest[]
}

export async function getRequestWithDetails(requestId: string): Promise<BookingRequestWithDetails | null> {
  const { data, error } = await supabase.from('booking_requests').select(WITH_DETAILS).eq('id', requestId).maybeSingle()
  if (error) throw error
  return data as BookingRequestWithDetails | null
}

// How many requests are waiting for this driver's answer (not yet expired).
export async function countPendingForDriver(driverId: string): Promise<number> {
  const { count, error } = await supabase
    .from('booking_requests')
    .select('id', { count: 'exact', head: true })
    .eq('driver_id', driverId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())

  if (error) throw error
  return count ?? 0
}

export interface RequestChangeHandlers {
  // A request about one of my rides was created or changed
  onDriverChange: (event: 'INSERT' | 'UPDATE', request: BookingRequest) => void
  // A request I sent was answered or changed
  onPassengerChange: (request: BookingRequest) => void
}

// Live updates over Supabase Realtime, so a driver hears about a request the moment it
// arrives and a passenger the moment it is answered. Returns an unsubscribe function.
export function subscribeToRequestChanges(userId: string, handlers: RequestChangeHandlers): () => void {
  const channel = supabase
    .channel(`booking-requests-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'booking_requests', filter: `driver_id=eq.${userId}` },
      (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          handlers.onDriverChange(payload.eventType, payload.new as BookingRequest)
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'booking_requests', filter: `passenger_id=eq.${userId}` },
      (payload) => handlers.onPassengerChange(payload.new as BookingRequest)
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
