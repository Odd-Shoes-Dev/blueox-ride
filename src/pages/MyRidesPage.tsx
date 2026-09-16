import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, withTimeout, checkSessionHealth, forceLogout, RequestTimeoutError } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Ride, Booking, User } from '@/types'
import { Calendar, Users, Plus, X, Phone, MessageCircle } from 'lucide-react'

interface RideWithBookings extends Ride {
  bookings: (Booking & { passenger: User })[]
}

interface BookingWithRide extends Booking {
  ride: Ride & { driver: User }
}

export default function MyRidesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState('bookings')
  const [myRides, setMyRides] = useState<RideWithBookings[]>([])
  const [myBookings, setMyBookings] = useState<BookingWithRide[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelDialog, setCancelDialog] = useState<{ type: 'ride' | 'booking'; id: string } | null>(null)
  const [canceling, setCanceling] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const fetchInProgress = useRef(false)

  const fetchData = useCallback(async () => {
    // Prevent concurrent fetches
    if (fetchInProgress.current) return
    fetchInProgress.current = true

    setLoading(true)
    setError(null)

    try {
      // Check session health first
      const sessionHealth = await checkSessionHealth()
      if (!sessionHealth.valid) {
        console.error('Session invalid:', sessionHealth.error)
        forceLogout()
        return
      }

      // Fetch rides I'm driving with timeout
      const { data: ridesData, error: ridesError } = await withTimeout(
        supabase
          .from('rides')
          .select(`
            *,
            bookings:bookings(*, passenger:users(*))
          `)
          .eq('driver_id', user?.id)
          .order('departure_time', { ascending: true }),
        15000
      )

      if (ridesError) {
        console.error('Error fetching rides:', ridesError)
        setError('Failed to load your rides. Please try again.')
      } else if (ridesData) {
        setMyRides(ridesData as RideWithBookings[])
      }

      // Fetch my bookings with timeout
      const { data: bookingsData, error: bookingsError } = await withTimeout(
        supabase
          .from('bookings')
          .select(`
            *,
            ride:rides(*, driver:users(*))
          `)
          .eq('passenger_id', user?.id)
          .order('created_at', { ascending: false }),
        15000
      )

      if (bookingsError) {
        console.error('Error fetching bookings:', bookingsError)
        setError('Failed to load your bookings. Please try again.')
      } else if (bookingsData) {
        setMyBookings(bookingsData as BookingWithRide[])
      }
    } catch (err) {
      if (err instanceof RequestTimeoutError) {
        console.error('Request timed out')
        setError('Request timed out. Please check your connection and try again.')
      } else {
        console.error('Fetch error:', err)
        setError('An error occurred. Please try again.')
      }
    } finally {
      setLoading(false)
      fetchInProgress.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // No deps - uses user from closure, guarded by ref

  useEffect(() => {
    if (user?.id) {
      fetchData()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]) // Only re-fetch when user ID changes

  const handleCancelRide = async (rideId: string) => {
    setCanceling(true)

    // Cancel the ride
    const { error } = await supabase
      .from('rides')
      .update({ status: 'cancelled' })
      .eq('id', rideId)

    if (error) {
      toast({
        title: 'Failed to cancel ride',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      // Refund all confirmed bookings
      const ride = myRides.find(r => r.id === rideId)
      const confirmedBookings = ride?.bookings.filter(b => b.status === 'confirmed') || []

      for (const booking of confirmedBookings) {
        // Trigger refund via edge function
        await supabase.functions.invoke('process-refund', {
          body: {
            booking_id: booking.id,
            cancellation_type: 'driver',
          },
        })
      }

      toast({
        title: 'Ride cancelled',
        description: confirmedBookings.length > 0
          ? 'Passengers will be refunded.'
          : 'Your ride has been cancelled.',
        variant: 'success',
      })
      fetchData()
    }

    setCanceling(false)
    setCancelDialog(null)
  }

  const handleCancelBooking = async (bookingId: string) => {
    setCanceling(true)

    const booking = myBookings.find(b => b.id === bookingId)

    if (booking?.status === 'confirmed') {
      // Trigger refund via edge function
      const { data, error } = await supabase.functions.invoke('process-refund', {
        body: {
          booking_id: bookingId,
          cancellation_type: 'passenger',
        },
      })

      if (error || !data?.success) {
        toast({
          title: 'Cancellation failed',
          description: data?.error || error?.message || 'Please try again.',
          variant: 'destructive',
        })
        setCanceling(false)
        setCancelDialog(null)
        return
      }

      toast({
        title: 'Booking cancelled',
        description: data.message,
        variant: 'success',
      })
    } else {
      // Just cancel the booking without refund
      await supabase
        .from('bookings')
        .update({ status: 'cancelled_by_passenger' })
        .eq('id', bookingId)

      toast({
        title: 'Booking cancelled',
        variant: 'success',
      })
    }

    fetchData()
    setCanceling(false)
    setCancelDialog(null)
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      full: 'bg-blue-100 text-blue-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
      pending_payment: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-green-100 text-green-800',
      cancelled_by_passenger: 'bg-red-100 text-red-800',
      cancelled_by_driver: 'bg-red-100 text-red-800',
    }

    const labels: Record<string, string> = {
      active: 'Active',
      full: 'Full',
      completed: 'Completed',
      cancelled: 'Cancelled',
      pending_payment: 'Payment Pending',
      confirmed: 'Confirmed',
      cancelled_by_passenger: 'Cancelled',
      cancelled_by_driver: 'Cancelled by Driver',
    }

    return (
      <span className={`text-xs px-2 py-1 rounded-full font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <div className="bg-navy-900 pt-12 pb-6 px-4">
          <div className="max-w-lg mx-auto">
            <h1 className="text-xl font-semibold text-white">My Rides</h1>
          </div>
        </div>
        <div className="px-4 mt-6">
          <div className="max-w-lg mx-auto">
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-destructive mb-4">{error}</p>
                <Button onClick={fetchData}>Try Again</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-navy-900 pt-12 pb-6 px-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-semibold text-white">My Rides</h1>
        </div>
      </div>

      <div className="px-4 mt-6">
        <div className="max-w-lg mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="bookings" className="flex-1">
                My Bookings ({myBookings.length})
              </TabsTrigger>
              <TabsTrigger value="driving" className="flex-1">
                Driving ({myRides.length})
              </TabsTrigger>
            </TabsList>

            {/* My Bookings Tab */}
            <TabsContent value="bookings" className="mt-4 space-y-3">
              {myBookings.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground mb-4">No bookings yet</p>
                    <Button onClick={() => navigate('/')}>Find a Ride</Button>
                  </CardContent>
                </Card>
              ) : (
                myBookings.map((booking) => (
                  <Card key={booking.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-coral-500" />
                            <span className="text-sm font-medium">{booking.ride.origin_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-destructive" />
                            <span className="text-sm font-medium">{booking.ride.destination_name}</span>
                          </div>
                        </div>
                        {getStatusBadge(booking.status)}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(booking.ride.departure_time)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {booking.seats_booked} seat(s)
                        </span>
                      </div>

                      {(booking.ride.car_brand || booking.ride.car_model) && (
                        <div className="text-xs text-muted-foreground mb-3">
                          {booking.ride.car_brand && booking.ride.car_model ? (
                            <p>{booking.ride.car_brand} {booking.ride.car_model} {booking.ride.car_year && `(${booking.ride.car_year})`}</p>
                          ) : (
                            <p>{booking.ride.car_brand || booking.ride.car_model}</p>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-coral-100 flex items-center justify-center text-navy-800 text-xs font-medium">
                            {booking.ride.driver.full_name[0]}
                          </div>
                          <span className="text-sm">{booking.ride.driver.full_name}</span>
                        </div>
                        <span className="font-medium">{formatCurrency(booking.ride.price)}</span>
                      </div>

                      {/* Actions */}
                      <div className="mt-4 pt-4 border-t flex gap-2">
                        {booking.status === 'pending_payment' && (
                          <Button
                            className="flex-1"
                            onClick={() => navigate(`/bookings/${booking.id}/pay`)}
                          >
                            Complete Payment
                          </Button>
                        )}

                        {booking.status === 'confirmed' && (
                          <>
                            <a href={`tel:${booking.ride.driver.phone_number}`} className="flex-1">
                              <Button variant="outline" className="w-full">
                                <Phone className="w-4 h-4 mr-1" />
                                Call
                              </Button>
                            </a>
                            <a
                              href={`https://wa.me/${booking.ride.driver.phone_number?.replace(/\D/g, '')}`}
                              className="flex-1"
                            >
                              <Button variant="outline" className="w-full">
                                <MessageCircle className="w-4 h-4 mr-1" />
                                WhatsApp
                              </Button>
                            </a>
                          </>
                        )}

                        {(booking.status === 'pending_payment' || booking.status === 'confirmed') &&
                          new Date(booking.ride.departure_time) > new Date() && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setCancelDialog({ type: 'booking', id: booking.id })}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* My Rides (Driving) Tab */}
            <TabsContent value="driving" className="mt-4 space-y-3">
              <Button
                className="w-full mb-4"
                onClick={() => navigate('/rides/create')}
              >
                <Plus className="w-4 h-4 mr-2" />
                Offer a Ride
              </Button>

              {myRides.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">
                      You haven't offered any rides yet.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                myRides.map((ride) => (
                  <Card key={ride.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-coral-500" />
                            <span className="text-sm font-medium">{ride.origin_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-destructive" />
                            <span className="text-sm font-medium">{ride.destination_name}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          {getStatusBadge(ride.status)}
                          <p className="text-sm font-medium mt-1">{formatCurrency(ride.price)}/seat</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(ride.departure_time)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {ride.total_seats - ride.available_seats}/{ride.total_seats} booked
                        </span>
                      </div>

                      {/* Passengers */}
                      {ride.bookings.filter(b => b.status === 'confirmed').length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-sm font-medium mb-2">Passengers</p>
                          <div className="space-y-2">
                            {ride.bookings
                              .filter(b => b.status === 'confirmed')
                              .map((booking) => (
                                <div key={booking.id} className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-coral-100 flex items-center justify-center text-navy-800 text-xs font-medium">
                                      {booking.passenger.full_name[0]}
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium">{booking.passenger.full_name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {booking.seats_booked} seat(s)
                                      </p>
                                    </div>
                                  </div>
                                  {booking.passenger.phone_number && (
                                    <a href={`tel:${booking.passenger.phone_number}`}>
                                      <Button variant="ghost" size="sm">
                                        <Phone className="w-4 h-4" />
                                      </Button>
                                    </a>
                                  )}
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      {ride.status === 'active' && new Date(ride.departure_time) > new Date() && (
                        <div className="mt-4 pt-4 border-t">
                          <Button
                            variant="outline"
                            className="w-full text-destructive hover:text-destructive"
                            onClick={() => setCancelDialog({ type: 'ride', id: ride.id })}
                          >
                            Cancel Ride
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelDialog} onOpenChange={() => setCancelDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cancel {cancelDialog?.type === 'ride' ? 'Ride' : 'Booking'}?
            </DialogTitle>
            <DialogDescription>
              {cancelDialog?.type === 'ride'
                ? 'All confirmed passengers will be refunded their booking fees.'
                : 'Refund policy: Cancel more than 1 hour before departure for a full refund. Cancellations within 1 hour forfeit the booking fee to the driver.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(null)}>
              Keep {cancelDialog?.type === 'ride' ? 'Ride' : 'Booking'}
            </Button>
            <Button
              variant="destructive"
              loading={canceling}
              onClick={() => {
                if (cancelDialog?.type === 'ride') {
                  handleCancelRide(cancelDialog.id)
                } else if (cancelDialog) {
                  handleCancelBooking(cancelDialog.id)
                }
              }}
            >
              Cancel {cancelDialog?.type === 'ride' ? 'Ride' : 'Booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
