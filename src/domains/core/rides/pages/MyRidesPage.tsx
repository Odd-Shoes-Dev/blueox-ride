import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ridesRepository,
  bookingsRepository,
  paymentsRepository,
  rideRequestsRepository,
  reviewsRepository,
  withTimeout,
  checkSessionHealth,
  forceLogout,
  RequestTimeoutError,
} from '@/shared/services/database'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { useToast } from '@/shared/hooks/use-toast'
import { PageContainer } from '@/shared/components/PageContainer'
import { ReviewDialog } from '@/domains/core/rides/components/ReviewDialog'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import { Calendar, Users, Plus, X, Phone, MessageCircle, Wallet, Star, CheckCircle } from 'lucide-react'
import type { RideRequest } from '@/shared/types'

type RideWithBookings = ridesRepository.RideWithBookings
type BookingWithRide = bookingsRepository.BookingWithRideAndDriver

export default function MyRidesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState('bookings')
  const [myRides, setMyRides] = useState<RideWithBookings[]>([])
  const [myBookings, setMyBookings] = useState<BookingWithRide[]>([])
  const [myRequests, setMyRequests] = useState<RideRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelDialog, setCancelDialog] = useState<{ type: 'ride' | 'booking' | 'request'; id: string } | null>(null)
  const [canceling, setCanceling] = useState(false)
  const [reviewedBookingIds, setReviewedBookingIds] = useState<Set<string>>(new Set())
  const [reviewTarget, setReviewTarget] = useState<{ bookingId: string; revieweeId: string; revieweeName: string } | null>(null)
  const [completingRideId, setCompletingRideId] = useState<string | null>(null)

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

      if (!user?.id) return

      // Fetch rides I'm driving with timeout
      try {
        const ridesData = await withTimeout(ridesRepository.getRidesForDriver(user.id), 15000)
        setMyRides(ridesData)
      } catch (ridesError) {
        console.error('Error fetching rides:', ridesError)
        setError('Failed to load your rides. Please try again.')
      }

      // Fetch my bookings with timeout
      try {
        const bookingsData = await withTimeout(bookingsRepository.getBookingsForPassenger(user.id), 15000)
        setMyBookings(bookingsData)
      } catch (bookingsError) {
        console.error('Error fetching bookings:', bookingsError)
        setError('Failed to load your bookings. Please try again.')
      }

      // Fetch my ride requests with timeout
      try {
        const requestsData = await withTimeout(rideRequestsRepository.getMyRideRequests(user.id), 15000)
        setMyRequests(requestsData)
      } catch (requestsError) {
        console.error('Error fetching ride requests:', requestsError)
      }

      // Fetch which completed bookings I've already reviewed
      try {
        const myReviews = await withTimeout(reviewsRepository.getMyReviewsAsReviewer(user.id), 15000)
        setReviewedBookingIds(new Set(myReviews.map((r) => r.booking_id)))
      } catch (reviewsError) {
        console.error('Error fetching reviews:', reviewsError)
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
    const { error } = await ridesRepository.cancelRide(rideId)

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
        await paymentsRepository.requestRefund(booking.id, 'driver')
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
      let data: { success: boolean; error?: string; message?: string } | undefined
      let error: Error | undefined
      try {
        data = await paymentsRepository.requestRefund(bookingId, 'passenger')
      } catch (err) {
        error = err as Error
      }

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
      await bookingsRepository.cancelBookingWithoutRefund(bookingId)

      toast({
        title: 'Booking cancelled',
        variant: 'success',
      })
    }

    fetchData()
    setCanceling(false)
    setCancelDialog(null)
  }

  const handleCancelRequest = async (requestId: string) => {
    setCanceling(true)

    const { error } = await rideRequestsRepository.cancelRideRequest(requestId)

    if (error) {
      toast({
        title: 'Failed to cancel request',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Request cancelled',
        variant: 'success',
      })
      fetchData()
    }

    setCanceling(false)
    setCancelDialog(null)
  }

  const handleMarkRideCompleted = async (rideId: string) => {
    setCompletingRideId(rideId)

    const { error } = await ridesRepository.markRideCompleted(rideId)

    if (error) {
      toast({
        title: 'Failed to mark trip completed',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Trip marked completed',
        description: 'You and your passengers can now leave reviews.',
        variant: 'success',
      })
      fetchData()
    }

    setCompletingRideId(null)
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
      open: 'bg-blue-100 text-blue-800',
      matched: 'bg-green-100 text-green-800',
      expired: 'bg-gray-100 text-gray-800',
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
      open: 'Waiting for a driver',
      matched: 'Matched!',
      expired: 'Expired',
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
        <div className="bg-header text-header-foreground pt-12 pb-6 px-4">
          <PageContainer>
            <h1 className="text-xl font-semibold text-header-foreground">My Rides</h1>
          </PageContainer>
        </div>
        <div className="px-4 mt-6">
          <PageContainer>
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-destructive mb-4">{error}</p>
                <Button onClick={fetchData}>Try Again</Button>
              </CardContent>
            </Card>
          </PageContainer>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-header text-header-foreground pt-12 pb-6 px-4">
        <PageContainer>
          <h1 className="text-xl font-semibold text-header-foreground">My Rides</h1>
        </PageContainer>
      </div>

      <div className="px-4 mt-6">
        <PageContainer size="wide">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="bookings" className="flex-1">
                My Bookings ({myBookings.length})
              </TabsTrigger>
              <TabsTrigger value="requests" className="flex-1">
                Requests ({myRequests.length})
              </TabsTrigger>
              <TabsTrigger value="driving" className="flex-1">
                Driving ({myRides.length})
              </TabsTrigger>
            </TabsList>

            {/* My Bookings Tab */}
            <TabsContent value="bookings" className="mt-4">
              {myBookings.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground mb-4">No bookings yet</p>
                    <Button onClick={() => navigate('/')}>Find a Ride</Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {myBookings.map((booking) => (
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

                        {booking.status === 'completed' && (
                          reviewedBookingIds.has(booking.id) ? (
                            <span className="flex-1 flex items-center justify-center gap-1 text-sm text-muted-foreground">
                              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                              You rated this driver
                            </span>
                          ) : (
                            <Button
                              className="flex-1"
                              variant="outline"
                              onClick={() => setReviewTarget({
                                bookingId: booking.id,
                                revieweeId: booking.ride.driver.id,
                                revieweeName: booking.ride.driver.full_name,
                              })}
                            >
                              <Star className="w-4 h-4 mr-1" />
                              Rate Driver
                            </Button>
                          )
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                </div>
              )}
            </TabsContent>

            {/* My Ride Requests Tab */}
            <TabsContent value="requests" className="mt-4">
              <Button
                className="w-full mb-4"
                onClick={() => navigate('/requests/new')}
              >
                <Plus className="w-4 h-4 mr-2" />
                Post a Request
              </Button>

              {myRequests.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">
                      You haven't posted any ride requests yet.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {myRequests.map((request) => (
                  <Card key={request.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-coral-500" />
                            <span className="text-sm font-medium">{request.origin_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-destructive" />
                            <span className="text-sm font-medium">{request.destination_name}</span>
                          </div>
                        </div>
                        {getStatusBadge(request.status)}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(request.departure_time)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-4 h-4" />
                          {request.seats_needed} seat(s)
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 font-medium">
                          <Wallet className="w-4 h-4" />
                          {formatCurrency(request.budget)}/seat
                        </span>
                        {request.status === 'open' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setCancelDialog({ type: 'request', id: request.id })}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      {request.status === 'matched' && request.matched_booking_id && (
                        <Button
                          className="w-full mt-3"
                          size="sm"
                          onClick={() => navigate(`/bookings/${request.matched_booking_id}/pay`)}
                        >
                          Complete Payment
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
                </div>
              )}
            </TabsContent>

            {/* My Rides (Driving) Tab */}
            <TabsContent value="driving" className="mt-4">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {myRides.map((ride) => (
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

                      {/* Completed passengers - rate them */}
                      {ride.bookings.filter(b => b.status === 'completed').length > 0 && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-sm font-medium mb-2">Passengers</p>
                          <div className="space-y-2">
                            {ride.bookings
                              .filter(b => b.status === 'completed')
                              .map((booking) => (
                                <div key={booking.id} className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-coral-100 flex items-center justify-center text-navy-800 text-xs font-medium">
                                      {booking.passenger.full_name[0]}
                                    </div>
                                    <p className="text-sm font-medium">{booking.passenger.full_name}</p>
                                  </div>
                                  {reviewedBookingIds.has(booking.id) ? (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                      Rated
                                    </span>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setReviewTarget({
                                        bookingId: booking.id,
                                        revieweeId: booking.passenger.id,
                                        revieweeName: booking.passenger.full_name,
                                      })}
                                    >
                                      <Star className="w-3 h-3 mr-1" />
                                      Rate
                                    </Button>
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

                      {(ride.status === 'active' || ride.status === 'full') &&
                        new Date(ride.departure_time) <= new Date() && (
                        <div className="mt-4 pt-4 border-t">
                          <Button
                            className="w-full"
                            loading={completingRideId === ride.id}
                            onClick={() => handleMarkRideCompleted(ride.id)}
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Mark Trip Completed
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </PageContainer>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelDialog} onOpenChange={() => setCancelDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cancel {cancelDialog?.type === 'ride' ? 'Ride' : cancelDialog?.type === 'request' ? 'Request' : 'Booking'}?
            </DialogTitle>
            <DialogDescription>
              {cancelDialog?.type === 'ride'
                ? 'All confirmed passengers will be refunded their booking fees.'
                : cancelDialog?.type === 'request'
                ? 'Drivers will no longer be able to accept this request.'
                : 'Refund policy: Cancel more than 1 hour before departure for a full refund. Cancellations within 1 hour forfeit the booking fee to the driver.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(null)}>
              Keep {cancelDialog?.type === 'ride' ? 'Ride' : cancelDialog?.type === 'request' ? 'Request' : 'Booking'}
            </Button>
            <Button
              variant="destructive"
              loading={canceling}
              onClick={() => {
                if (cancelDialog?.type === 'ride') {
                  handleCancelRide(cancelDialog.id)
                } else if (cancelDialog?.type === 'request') {
                  handleCancelRequest(cancelDialog.id)
                } else if (cancelDialog) {
                  handleCancelBooking(cancelDialog.id)
                }
              }}
            >
              Cancel {cancelDialog?.type === 'ride' ? 'Ride' : cancelDialog?.type === 'request' ? 'Request' : 'Booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      {reviewTarget && user && (
        <ReviewDialog
          open={!!reviewTarget}
          onOpenChange={(open) => !open && setReviewTarget(null)}
          bookingId={reviewTarget.bookingId}
          revieweeId={reviewTarget.revieweeId}
          revieweeName={reviewTarget.revieweeName}
          reviewerId={user.id}
          onSubmitted={() => {
            setReviewTarget(null)
            fetchData()
          }}
        />
      )}
    </div>
  )
}
