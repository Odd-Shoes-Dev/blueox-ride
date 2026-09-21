import { supabase } from './client'
import type { Booking, Ride, User } from '@/shared/types'

export async function getActiveBookingForRide(rideId: string, passengerId: string): Promise<Booking | null> {
  const { data } = await supabase
    .from('bookings')
    .select('*')
    .eq('ride_id', rideId)
    .eq('passenger_id', passengerId)
    .not('status', 'in', '("cancelled_by_passenger","cancelled_by_driver")')
    .single()

  return (data as Booking) ?? null
}

export interface BookRideParams {
  rideId: string
  seats: number
  churchId: string | null
}

// Book seats on a ride. The database does the whole thing in one step (checks the ride and
// seats, works out the fee): while payments are off the booking is free and confirmed at
// once; while they're on it starts as 'pending_payment' with the booking fee. Returns the
// new booking's id.
export async function bookRide(params: BookRideParams): Promise<string> {
  const { data, error } = await supabase.rpc('book_ride', {
    p_ride_id: params.rideId,
    p_seats: params.seats,
    p_church_id: params.churchId,
  })

  if (error) throw error
  return data as string
}

// Confirm a booking that was left unpaid from before payments were switched off.
export async function confirmPendingBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_pending_booking', { p_booking_id: bookingId })
  if (error) throw error
}

export type BookingWithRideAndDriver = Booking & { ride: Ride & { driver: User } }

export async function getBookingsForPassenger(passengerId: string): Promise<BookingWithRideAndDriver[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      ride:rides(*, driver:users(*))
    `)
    .eq('passenger_id', passengerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as BookingWithRideAndDriver[]
}

export async function cancelBookingWithoutRefund(bookingId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled_by_passenger' })
    .eq('id', bookingId)

  return { error: error as Error | null }
}

// The driver ticks a booked passenger as "in the car" (or takes the tick back).
export async function setPickedUp(bookingId: string, pickedUp: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_booking_picked_up', { p_booking_id: bookingId, p_picked_up: pickedUp })
  if (error) throw error
}

// The passenger never turned up: cancels the booking and gives the seats back.
export async function markNoShow(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_booking_no_show', { p_booking_id: bookingId })
  if (error) throw error
}

// Cancel a booking that has no payment to refund (free bookings). Seats go back on the ride
// through the database's seat-counting rule.
export async function cancelBooking(
  bookingId: string,
  by: 'passenger' | 'driver'
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('bookings')
    .update({ status: by === 'passenger' ? 'cancelled_by_passenger' : 'cancelled_by_driver' })
    .eq('id', bookingId)

  return { error: error as Error | null }
}

export type BookingWithRide = Booking & { ride: Ride }

export async function getBookingWithRide(bookingId: string): Promise<BookingWithRide | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      *,
      ride:rides(*)
    `)
    .eq('id', bookingId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as BookingWithRide
}
