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

export interface CreateBookingParams {
  rideId: string
  passengerId: string
  seatsBooked: number
  bookingFee: number
  churchId: string | null
}

export async function createBooking(params: CreateBookingParams): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      ride_id: params.rideId,
      passenger_id: params.passengerId,
      seats_booked: params.seatsBooked,
      booking_fee: params.bookingFee,
      status: 'pending_payment',
      church_id: params.churchId,
    })
    .select()
    .single()

  if (error) throw error
  return data as Booking
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
