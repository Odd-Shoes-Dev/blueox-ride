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

// Watches one booking for the driver ticking "Picked up" — used to stop a passenger's own live
// location share automatically once they're in the car (migration 21 adds bookings to the
// realtime publication for this). Returns an unsubscribe function.
export function subscribeToBookingPickedUp(bookingId: string, onPickedUp: () => void): () => void {
  const channel = supabase
    .channel(`booking-picked-up-${bookingId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${bookingId}` },
      ({ new: row }) => {
        if ((row as { picked_up_at: string | null }).picked_up_at) onPickedUp()
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// There used to be an instant-booking path here (book_ride, migration 08). Since migration 15
// every booking goes through bookingRequestsRepository.requestBooking() instead — the driver
// always accepts before a booking exists — so this no longer has a client. The database
// function itself is left in place (harmless) but its EXECUTE grant was revoked, so calling it
// directly would fail the same way going through the app does.

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
