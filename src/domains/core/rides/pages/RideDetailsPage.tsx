import { useState, useEffect, useMemo } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ridesRepository, bookingsRepository, bookingRequestsRepository, authRepository } from '@/shared/services/database'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { RideDetailsSEO } from '@/shared/components/SEO'
import { PageContainer } from '@/shared/components/PageContainer'
import { useToast } from '@/shared/hooks/use-toast'
import { getStoredChurchId } from '@/shared/lib/churchAttribution'
import type { Booking, BookingRequest } from '@/shared/types'
import { formatCurrency, formatDate, calculateBookingFee, getErrorMessage } from '@/shared/lib/utils'
import { LocationPicker } from '@/domains/core/rides/components/LocationPicker'
import { measureRoute, progressAlongRoute } from '@/domains/core/rides/lib/routeProgress'
import {
  DECLINE_REASON_LABELS,
  MAX_REQUEST_ATTEMPTS,
  useBookingRequests,
} from '@/domains/core/rides/requests/BookingRequestsContext'
import { useOptionalMapShell } from '@/domains/core/rides/map/MapShellContext'
import { usePayments } from '@/shared/contexts/AppSettingsContext'
import { useRideRouteOnMap, formatDistance, formatDuration } from '@/domains/core/rides/hooks/useRideRouteOnMap'
import { ArrowLeft, Calendar, Users, Star, Phone, MessageCircle, Clock, Info, Car, Navigation, Loader2, Pencil } from 'lucide-react'

type RideWithDriver = ridesRepository.RideWithDriverDetail

export default function RideDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [ride, setRide] = useState<RideWithDriver | null>(null)
  const [existingBooking, setExistingBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [showBookingDialog, setShowBookingDialog] = useState(false)
  // Starting a trip shares the driver's position, so it's confirmed each time
  const [showStartTripNotice, setShowStartTripNotice] = useState(false)
  const [seats, setSeats] = useState(1)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [booking, setBooking] = useState(false)
  // Every booking is a request to the driver: seats, own stops and an offer
  const [myRequests, setMyRequests] = useState<BookingRequest[]>([]) // this rider's requests on this ride, newest first
  const [pickupStop, setPickupStop] = useState<Stop | null>(null)
  const [dropoffStop, setDropoffStop] = useState<Stop | null>(null)
  // Whether the "different stops/price" reveal is open — closed by default, since most bookings
  // use the ride's own start, end and listed price.
  const [showMore, setShowMore] = useState(false)
  const [offer, setOffer] = useState('') // per seat, as typed
  const { pendingCount, version: requestsVersion } = useBookingRequests()
  // Are bookings charged right now? Off = free: no booking fee, pay the driver directly.
  const { paymentsEnabled } = usePayments()

  const isDriver = ride?.driver_id === user?.id

  const canTrackLive = !!ride && (ride.status === 'active' || ride.status === 'full')
  const isConfirmedPassenger = existingBooking?.status === 'confirmed'

  // Live trip (runs in the app shell, so it keeps going when this panel is closed):
  // the driver starts/ends it here; a confirmed passenger automatically follows the driver.
  const shell = useOptionalMapShell()
  const watchDriver = shell?.watchDriver
  const isMyTrip = shell?.liveTrip?.role === 'driver' && shell.liveTrip.ride.id === id
  const driverSeen = shell?.liveTrip?.ride.id === id && shell?.livePosition != null

  // A guide for someone riding only part of the route: the listed price scaled by how much of the
  // road they ride, worked out from where their stops sit along the ride's route (if it has loaded).
  const featuredRoute = shell?.featured && shell.featured.rideId === id ? shell.featured : null
  const suggestedShare = useMemo(() => {
    if (!ride || !featuredRoute?.summary || (!pickupStop && !dropoffStop)) return null
    const measure = measureRoute(featuredRoute.points)
    const duration = featuredRoute.summary.durationMin
    const from = pickupStop ? (progressAlongRoute(featuredRoute.points, measure, pickupStop, duration)?.fractionDone ?? 0) : 0
    const to = dropoffStop ? (progressAlongRoute(featuredRoute.points, measure, dropoffStop, duration)?.fractionDone ?? 1) : 1
    const part = to - from
    if (part <= 0) return null
    return Math.max(500, Math.round((ride.price * part) / 500) * 500)
  }, [ride, featuredRoute, pickupStop, dropoffStop])

  // Show this ride on the app's main map (road route) rather than a second map inside
  // the panel. The route stays on the map after this panel closes.
  const { summary: routeSummary, loading: routeLoading } = useRideRouteOnMap(
    ride && ride.origin_lat && ride.origin_lng && ride.destination_lat && ride.destination_lng ? ride : null
  )

  useEffect(() => {
    if (ride && watchDriver && canTrackLive && !isDriver && isConfirmedPassenger) watchDriver(ride)
    // Re-run when the ride or the passenger's status changes, not on every refetch of the object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id, canTrackLive, isDriver, isConfirmedPassenger, watchDriver])

  useEffect(() => {
    if (id) {
      fetchRide()
    }
  }, [id])

  // When one of this rider's requests is answered (live), reload the booking and requests quietly.
  useEffect(() => {
    if (!id || !user || !ride || ride.driver_id === user.id) return
    refreshMine()
    // Only when a request changes; the functions used are re-created on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestsVersion])

  useEffect(() => {
    if (profile?.phone_number) {
      setPhoneNumber(profile.phone_number)
    }
  }, [profile])

  const fetchRide = async () => {
    setLoading(true)

    if (!id) return

    let rideData: RideWithDriver | null
    try {
      rideData = await ridesRepository.getRideWithDriver(id)
    } catch (rideError) {
      console.error('Fetch ride error:', rideError)
      rideData = null
    }

    if (!rideData) {
      toast({
        title: 'Ride not found',
        description: 'This ride may have been removed.',
        variant: 'destructive',
      })
      navigate('/')
      return
    }

    setRide(rideData)
    setOffer(String(rideData.price)) // the offer starts at the listed price

    // Check for existing booking, and for this rider's requests on the ride
    if (user) {
      const bookingData = await bookingsRepository.getActiveBookingForRide(id, user.id)
      if (bookingData) {
        setExistingBooking(bookingData)
      }
      if (rideData.driver_id !== user.id) {
        try {
          setMyRequests(await bookingRequestsRepository.getMyRequestsForRide(id, user.id))
        } catch (error) {
          console.error('Could not load your requests:', error)
        }
      }
    }

    setLoading(false)
  }

  // Reload just the rider's booking and requests (no spinner).
  const refreshMine = async () => {
    if (!id || !user) return
    try {
      const [bookingData, requests] = await Promise.all([
        bookingsRepository.getActiveBookingForRide(id, user.id),
        bookingRequestsRepository.getMyRequestsForRide(id, user.id),
      ])
      setExistingBooking(bookingData)
      setMyRequests(requests)
    } catch (error) {
      console.error('Could not refresh your booking:', error)
    }
  }

  const handleBook = async () => {
    if (!user || !ride) return

    // Validate phone number
    const phoneRegex = /^(\+256|0)?[7-9]\d{8}$/
    if (!phoneRegex.test(phoneNumber.replace(/\s/g, ''))) {
      toast({
        title: 'Invalid phone number',
        description: 'Please enter a valid Uganda phone number (07XXXXXXXX)',
        variant: 'destructive',
      })
      return
    }

    if (offerNumber <= 0) {
      toast({ title: 'Enter your offer', description: 'Type how much you can pay per seat.', variant: 'destructive' })
      return
    }

    if (seats > ride.available_seats) {
      toast({
        title: 'Not enough seats',
        description: `Only ${ride.available_seats} seats available.`,
        variant: 'destructive',
      })
      return
    }

    setBooking(true)

    // Get church attribution if user came from a church landing page
    const churchId = getStoredChurchId()

    // Every booking now goes to the driver to accept — there's no path that confirms
    // straight away, so a seat is never taken without the driver having seen who it is.
    try {
      await bookingRequestsRepository.requestBooking({
        rideId: ride.id,
        seats,
        offer: offerNumber,
        pickup: pickupStop,
        dropoff: dropoffStop,
        churchId,
      })
    } catch (requestError) {
      console.error('Request error:', requestError)
      toast({ title: 'Could not send the request', description: getErrorMessage(requestError), variant: 'destructive' })
      setBooking(false)
      return
    }

    if (!profile?.phone_number && phoneNumber) {
      await authRepository.updateUserProfile(user.id, { phone_number: phoneNumber })
    }

    setShowBookingDialog(false)
    toast({
      title: 'Request sent',
      description: "The driver will accept or refuse. You'll be told here as soon as they answer.",
      variant: 'success',
    })
    await refreshMine()
    setBooking(false)
  }

  // Place a stop on the app's main map: close the dialog so the map is usable, then reopen it.
  const pickStop = async (kind: 'pickup' | 'dropoff') => {
    if (!shell) return
    setShowBookingDialog(false)
    const point = await shell.requestPin(kind, kind === 'pickup' ? pickupStop : dropoffStop)
    setShowBookingDialog(true)
    if (point) {
      if (kind === 'pickup') setPickupStop(point)
      else setDropoffStop(point)
    }
  }

  const handleWithdraw = async (requestId: string) => {
    setBooking(true)
    try {
      await bookingRequestsRepository.withdrawRequest(requestId)
      toast({ title: 'Request withdrawn' })
      await refreshMine()
    } catch (error) {
      toast({ title: 'Could not withdraw', description: getErrorMessage(error), variant: 'destructive' })
    }
    setBooking(false)
  }

  // A booking left unpaid from before payments were switched off: confirm it, for free.
  const handleConfirmFree = async () => {
    if (!existingBooking) return
    setBooking(true)
    try {
      await bookingsRepository.confirmPendingBooking(existingBooking.id)
      toast({
        title: 'Seat confirmed!',
        description: "You're booked. Contact the driver to arrange your pickup.",
        variant: 'success',
      })
      await fetchRide()
    } catch (error) {
      console.error('Confirm booking error:', error)
      toast({
        title: 'Could not confirm',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    }
    setBooking(false)
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  if (loading) {
    return (
      <div className="min-h-[50dvh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!ride) return null

  // With payments off there is no fee: the passenger pays the driver the whole price in cash.
  // (Used for an already-accepted booking's payment status below — a request being sent doesn't
  // charge anything yet, that only applies once the driver accepts.)
  const bookingFee = paymentsEnabled ? calculateBookingFee(ride.price) : 0

  const isPastRide = new Date(ride.departure_time) < new Date()

  // The rider's requests on this ride: how many attempts are left, and what state the last one is in.
  const lastRequest = myRequests[0]
  const waitingRequest = myRequests.find((r) => r.status === 'pending' && new Date(r.expires_at) > new Date())
  const attemptsLeft = MAX_REQUEST_ATTEMPTS - myRequests.length
  const blockedByDriver = myRequests.some((r) => r.blocked)

  const offerNumber = parseInt(offer) || 0

  const rideIsBookable =
    !existingBooking &&
    !waitingRequest &&
    !blockedByDriver &&
    ride.available_seats > 0 &&
    ride.status === 'active' &&
    !isPastRide
  const canBook = user && !isDriver && rideIsBookable
  const showLoginToBook = !user && rideIsBookable

  return (
    <>
      <RideDetailsSEO
        origin={ride.origin_name}
        destination={ride.destination_name}
        price={ride.price}
        rideId={id || ''}
      />
      <div className="min-h-full bg-background pb-6">
        {/* Header */}
        <div className="bg-header text-header-foreground pt-12 max-md:pt-6 pb-20 px-4">
          <PageContainer>
            <button
              onClick={() => navigate(-1)}
              className="flex items-center text-header-foreground/80 hover:text-header-foreground mb-4"
            >
              <ArrowLeft className="w-5 h-5 mr-1" />
              Back
            </button>
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-xl font-semibold text-header-foreground">Ride Details</h1>
              {isDriver && ride.status !== 'completed' && (
                <Link
                  to={`/rides/${id}/edit`}
                  className="flex items-center gap-1.5 text-sm font-medium text-header-foreground/90 hover:text-header-foreground"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </Link>
              )}
            </div>
          </PageContainer>
        </div>

      {/* Content */}
      <div className="px-4 -mt-12">
        <PageContainer className="space-y-4">
          {/* Route Card */}
          <Card>
            <CardContent className="p-5">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-coral-500" />
                    <div className="w-0.5 h-10 bg-border" />
                    <div className="w-3 h-3 rounded-full bg-destructive" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">From</p>
                      <p className="font-medium">{ride.origin_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">To</p>
                      <p className="font-medium">{ride.destination_name}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>{formatDate(ride.departure_time)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span>{ride.available_seats} of {ride.total_seats} seats left</span>
                  </div>
                </div>

                {(routeSummary || routeLoading) && (
                  <div className="flex items-center gap-6 pt-4 border-t text-sm">
                    {routeSummary ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Navigation className="w-4 h-4 text-coral-500" />
                          <span className="font-medium">{formatDistance(routeSummary.distanceKm)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>~{formatDuration(routeSummary.durationMin)}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">shown on the map</span>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Working out the route...
                      </div>
                    )}
                  </div>
                )}

                {ride.notes && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{ride.notes}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Live Location Sharing - driver's own control */}
          {isDriver && canTrackLive && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Navigation className={`w-4 h-4 ${isMyTrip ? 'text-green-600' : 'text-muted-foreground'}`} />
                  <span>
                    {isMyTrip
                      ? 'Trip in progress — your position is shared live and shown on the map'
                      : 'Start the trip to share your live position, see distance left, and keep the screen on'}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={isMyTrip ? 'outline' : 'default'}
                  onClick={() => (isMyTrip ? shell?.stopLiveTrip() : setShowStartTripNotice(true))}
                  disabled={!shell}
                >
                  {isMyTrip ? 'End trip' : 'Start trip'}
                </Button>
              </CardContent>
              {shell?.liveError && !isMyTrip && (
                <CardContent className="pt-0 pb-4 -mt-2">
                  <p className="text-xs text-destructive">{shell.liveError}</p>
                </CardContent>
              )}
            </Card>
          )}

          {/* Live Location Sharing - passenger's status caption */}
          {!isDriver && canTrackLive && isConfirmedPassenger && !driverSeen && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
              <Loader2 className="w-4 h-4 animate-spin" />
              Waiting for the driver to start sharing their location...
            </div>
          )}

          {/* Car Details Card */}
          {(ride.car_brand || ride.car_model || ride.car_year || ride.car_photo) && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Car className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Car Details</span>
                </div>
                {(ride.car_brand || ride.car_model || ride.car_year) && (
                  <div className="space-y-2 mb-4">
                    {ride.car_brand && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Brand</span>
                        <span className="font-medium">{ride.car_brand}</span>
                      </div>
                    )}
                    {ride.car_model && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Model</span>
                        <span className="font-medium">{ride.car_model}</span>
                      </div>
                    )}
                    {ride.car_year && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Year</span>
                        <span className="font-medium">{ride.car_year}</span>
                      </div>
                    )}
                  </div>
                )}
                {ride.car_photo && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Car Photo</p>
                    <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                      <img
                        src={ride.car_photo.photo_url}
                        alt="Driver's car"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {ride.car_photo.caption && (
                      <p className="text-sm text-muted-foreground mt-2">{ride.car_photo.caption}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Driver Card */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <Avatar className="w-14 h-14">
                  <AvatarImage src={ride.driver.avatar_url || undefined} />
                  <AvatarFallback className="bg-coral-100 text-navy-800">
                    {getInitials(ride.driver.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-semibold">{ride.driver.full_name}</p>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    {ride.driver.average_rating && (
                      <span className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        {ride.driver.average_rating.toFixed(1)}
                      </span>
                    )}
                    <span>{ride.driver.total_rides} rides</span>
                  </div>
                </div>
              </div>

              {/* Show driver contact only for confirmed bookings */}
              {existingBooking?.status === 'confirmed' && ride.driver.phone_number && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-2">Contact Driver</p>
                  <div className="flex gap-2">
                    <a
                      href={`tel:${ride.driver.phone_number}`}
                      className="flex-1"
                    >
                      <Button variant="outline" className="w-full">
                        <Phone className="w-4 h-4 mr-2" />
                        Call
                      </Button>
                    </a>
                    <a
                      href={`https://wa.me/${ride.driver.phone_number.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1"
                    >
                      <Button variant="outline" className="w-full">
                        <MessageCircle className="w-4 h-4 mr-2" />
                        WhatsApp
                      </Button>
                    </a>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Price Card */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-muted-foreground">Price per seat</span>
                <span className="text-2xl font-bold text-navy-900">
                  {formatCurrency(ride.price)}
                </span>
              </div>

              {paymentsEnabled ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Booking fee (10%)</span>
                    <span>{formatCurrency(bookingFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pay driver in cash (90%)</span>
                    <span>{formatCurrency(ride.price - bookingFee)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No booking fee — you pay the driver this price in cash after the ride.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Requests to the driver: a waiting one, the last answer, and how many attempts are left */}
          {!existingBooking && !isDriver && user && (waitingRequest || lastRequest) && (
            <RequestStatusCard
              waiting={waitingRequest}
              last={lastRequest}
              attemptsLeft={attemptsLeft}
              blocked={blockedByDriver}
              busy={booking}
              onWithdraw={handleWithdraw}
              onTryAgain={() => {
                if (lastRequest) {
                  setOffer(String(lastRequest.offer_price))
                  setSeats(lastRequest.seats)
                }
                setShowBookingDialog(true)
              }}
            />
          )}

          {/* The driver's view: requests waiting for an answer */}
          {isDriver && pendingCount > 0 && (
            <Card className="border-primary">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {pendingCount} booking request{pendingCount > 1 ? 's' : ''} waiting for your answer
                </p>
                <Button asChild size="sm">
                  <Link to="/booking-requests">Open</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Booking Status / Actions */}
          {existingBooking ? (
            <Card className={existingBooking.status === 'confirmed' ? 'border-green-500 bg-green-50' : 'border-yellow-500 bg-yellow-50'}>
              <CardContent className="p-5">
                {existingBooking.status === 'pending_payment' ? (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-5 h-5 text-yellow-600" />
                      <span className="font-medium text-yellow-800">
                        {paymentsEnabled ? 'Payment Pending' : 'Booking not confirmed yet'}
                      </span>
                    </div>
                    <p className="text-sm text-yellow-700 mb-4">
                      {paymentsEnabled
                        ? 'Complete payment to confirm your booking and access driver contact.'
                        : 'Bookings are free now. Confirm this one to get the driver\'s contact.'}
                    </p>
                    {paymentsEnabled ? (
                      <Button
                        className="w-full"
                        onClick={() => navigate(`/bookings/${existingBooking.id}/pay`)}
                      >
                        Complete Payment ({formatCurrency(existingBooking.booking_fee)})
                      </Button>
                    ) : (
                      <Button className="w-full" onClick={handleConfirmFree} loading={booking}>
                        Confirm my seat — free
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="font-medium text-green-800">Booking Confirmed</span>
                    </div>
                    <p className="text-sm text-green-700">
                      You have booked {existingBooking.seats_booked} seat(s). Contact the driver to coordinate pickup.
                    </p>
                    {(existingBooking.pickup_name || existingBooking.dropoff_name) && (
                      <p className="text-sm text-green-700 mt-1">
                        Pickup: {existingBooking.pickup_name ?? ride.origin_name} · Drop-off:{' '}
                        {existingBooking.dropoff_name ?? ride.destination_name}
                      </p>
                    )}
                    <p className="text-sm text-green-700 mt-2 font-medium">
                      Pay {formatCurrency(((existingBooking.agreed_price ?? ride.price) - existingBooking.booking_fee / existingBooking.seats_booked) * existingBooking.seats_booked)} cash to driver after ride.
                      {existingBooking.agreed_price != null && existingBooking.agreed_price !== ride.price && ' (the price you agreed)'}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : isPastRide ? (
            <Card className="border-muted">
              <CardContent className="p-5 text-center">
                <p className="text-muted-foreground">This ride has already departed.</p>
              </CardContent>
            </Card>
          ) : ride.status !== 'active' ? (
            <Card className="border-muted">
              <CardContent className="p-5 text-center">
                <p className="text-muted-foreground">This ride is no longer available.</p>
              </CardContent>
            </Card>
          ) : isDriver ? (
            <Card className="border-coral-200 bg-coral-50">
              <CardContent className="p-5">
                <p className="text-sm text-navy-800 mb-3">This is your ride listing.</p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate(`/my-rides`)}
                >
                  Manage My Rides
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* Payment Info */}
          {canBook && (
            <div className="p-4 bg-coral-50 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-navy-900 mt-0.5" />
                <div className="text-sm text-navy-800">
                  <p className="font-medium mb-1">How booking works</p>
                  {paymentsEnabled ? (
                    <ul className="space-y-1">
                      <li>1. Send a request with your seats, stops and offer</li>
                      <li>2. The driver accepts or refuses</li>
                      <li>3. Once accepted, pay 10% ({formatCurrency(bookingFee)}/seat) via mobile money</li>
                      <li>4. Pay the remaining 90% ({formatCurrency(ride.price - bookingFee)}/seat) in cash to driver</li>
                    </ul>
                  ) : (
                    <ul className="space-y-1">
                      <li>1. Send a request with your seats, stops and offer — it's free</li>
                      <li>2. The driver accepts or refuses</li>
                      <li>3. Once accepted, get their contact and pay {formatCurrency(ride.price)}/seat in cash after the ride</li>
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </PageContainer>
      </div>

      {/* Book Button - positioned above BottomNav */}
      {canBook && (
        <div className="sticky bottom-0 p-4 bg-background border-t z-40">
          <PageContainer>
            <Button className="w-full" size="lg" onClick={() => setShowBookingDialog(true)}>
              Request to Book
            </Button>
          </PageContainer>
        </div>
      )}

      {/* Login to Book Button - for guests */}
      {showLoginToBook && (
        <div className="sticky bottom-0 p-4 bg-background border-t z-40">
          <PageContainer>
            <Button
              className="w-full"
              size="lg"
              onClick={() => navigate('/login', { state: { from: `/rides/${id}` } })}
            >
              Sign In to Request a Seat
            </Button>
          </PageContainer>
        </div>
      )}

      {/* Asked every time a driver starts a trip: what it shares, and with whom */}
      <Dialog open={showStartTripNotice} onOpenChange={setShowStartTripNotice}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share your live location?</DialogTitle>
            <DialogDescription>
              Your location will be shared with passengers on this ride until you end the trip.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5 text-sm text-muted-foreground list-disc pl-5">
            <li>Only passengers with a confirmed booking on this ride can see it.</li>
            <li>It updates every few seconds while the trip runs, and it isn't saved.</li>
            <li>It stops when you tap End trip or close the app.</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStartTripNotice(false)}>
              Not now
            </Button>
            <Button
              onClick={() => {
                setShowStartTripNotice(false)
                if (ride) shell?.startDriverTrip(ride)
              }}
            >
              Share and start trip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Dialog */}
      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ask the Driver</DialogTitle>
            <DialogDescription>
              Your request goes to the driver, who accepts or refuses. You'll be told here as soon as they answer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="seats">Number of seats</Label>
              <Input
                id="seats"
                type="number"
                min={1}
                max={ride.available_seats}
                value={seats}
                onChange={(e) => setSeats(Math.min(parseInt(e.target.value) || 1, ride.available_seats))}
              />
              <p className="text-xs text-muted-foreground">
                Max {ride.available_seats} seat(s) available
              </p>
            </div>

            {/* Closed by default, like a login card's "Forgot password?" — most people send the
                ride's own stops at the listed price and never need to open this. */}
            <div className="space-y-3">
              <button
                type="button"
                className="text-sm text-primary underline"
                onClick={() => setShowMore((current) => !current)}
              >
                {showMore ? "Use the ride's own stops and price" : 'Want a different pickup, drop-off or price?'}
              </button>
              {showMore && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Where will you get in?</Label>
                    <LocationPicker
                      value={pickupStop}
                      onChange={setPickupStop}
                      placeholder={`${ride.origin_name} (the ride's start)`}
                      markerColor="pickup"
                      onPickOnMap={() => pickStop('pickup')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Where will you get off?</Label>
                    <LocationPicker
                      value={dropoffStop}
                      onChange={setDropoffStop}
                      placeholder={`${ride.destination_name} (the ride's end)`}
                      markerColor="dropoff"
                      onPickOnMap={() => pickStop('dropoff')}
                    />
                  </div>
                  {suggestedShare !== null && (
                    <p className="text-xs text-muted-foreground">
                      For your part of the trip, about {formatCurrency(suggestedShare)} per seat would be a fair share of
                      the listed {formatCurrency(ride.price)}. It's only a guide.
                    </p>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="offer">What you can pay per seat (UGX)</Label>
                    <Input
                      id="offer"
                      type="number"
                      min={500}
                      step={500}
                      value={offer}
                      onChange={(e) => setOffer(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Listed price: {formatCurrency(ride.price)}
                      {lastRequest?.status === 'declined' ? ` · attempt ${myRequests.length + 1} of ${MAX_REQUEST_ATTEMPTS}` : ''}.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{paymentsEnabled ? 'Mobile money number' : 'Your phone number'}</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="07XX XXX XXX"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {paymentsEnabled
                  ? "You'll receive a payment prompt on this number"
                  : 'Shared with the driver so they can reach you about the pickup'}
              </p>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>You offer ({seats} seat{seats > 1 ? 's' : ''})</span>
                <span className="font-medium">{formatCurrency(offerNumber * seats)}</span>
              </div>
              <div className="flex justify-between font-medium pt-2 border-t">
                <span>Listed price for comparison</span>
                <span>{formatCurrency(ride.price * seats)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBookingDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleBook} loading={booking}>
              Send request
            </Button>
          </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}

// A place the rider picked for getting in or off
interface Stop {
  lat: number
  lng: number
  name: string
}

// Where the rider stands with the driver: a waiting request (withdraw it), or the driver's
// answer with how many attempts remain (and a way to try again).
function RequestStatusCard({
  waiting,
  last,
  attemptsLeft,
  blocked,
  busy,
  onWithdraw,
  onTryAgain,
}: {
  waiting: BookingRequest | undefined
  last: BookingRequest | undefined
  attemptsLeft: number
  blocked: boolean
  busy: boolean
  onWithdraw: (requestId: string) => void
  onTryAgain: () => void
}) {
  if (waiting) {
    return (
      <Card className="border-yellow-500 bg-yellow-50">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-yellow-600" />
            <span className="font-medium text-yellow-800">Request sent — waiting for the driver</span>
          </div>
          <p className="text-sm text-yellow-700 mb-3">
            You offered {formatCurrency(waiting.offer_price)} per seat for {waiting.seats} seat{waiting.seats > 1 ? 's' : ''}
            {waiting.pickup_name || waiting.dropoff_name
              ? `, getting in at ${waiting.pickup_name ?? 'the start'} and off at ${waiting.dropoff_name ?? 'the end'}`
              : ''}
            . You'll be told here as soon as they answer.
          </p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onWithdraw(waiting.id)}>
            Withdraw request
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (last?.status !== 'declined') return null

  return (
    <Card className="border-red-300 bg-red-50">
      <CardContent className="p-5">
        <p className="font-medium text-red-800 mb-1">Your request was refused</p>
        {last.decline_reason && <p className="text-sm text-red-700">{DECLINE_REASON_LABELS[last.decline_reason]}.</p>}
        {blocked ? (
          <p className="text-sm text-red-700 mt-2">The driver isn't taking more requests from you on this ride.</p>
        ) : attemptsLeft > 0 ? (
          <>
            <p className="text-sm text-red-700 mt-2">
              You can ask again with a different offer, seats, or pickup/drop-off ({attemptsLeft} of {MAX_REQUEST_ATTEMPTS}{' '}
              attempt{attemptsLeft > 1 ? 's' : ''} left).
            </p>
            <Button size="sm" className="mt-3" onClick={onTryAgain}>
              Ask again
            </Button>
          </>
        ) : (
          <p className="text-sm text-red-700 mt-2">You've used all {MAX_REQUEST_ATTEMPTS} requests on this ride.</p>
        )}
      </CardContent>
    </Card>
  )
}
