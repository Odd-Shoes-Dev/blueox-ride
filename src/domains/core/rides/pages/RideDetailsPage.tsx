import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ridesRepository, bookingsRepository, authRepository } from '@/shared/services/database'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { MapView } from '@/domains/core/rides/components/MapView'
import { RideDetailsSEO } from '@/shared/components/SEO'
import { PageContainer } from '@/shared/components/PageContainer'
import { useToast } from '@/shared/hooks/use-toast'
import { getStoredChurchId } from '@/shared/lib/churchAttribution'
import { formatCurrency, formatDate, calculateBookingFee } from '@/shared/lib/utils'
import { useDriverLocationSharing } from '@/domains/core/rides/hooks/useDriverLocationSharing'
import { useLiveDriverLocation } from '@/domains/core/rides/hooks/useLiveDriverLocation'
import type { Booking } from '@/shared/types'
import { ArrowLeft, Calendar, Users, Star, Phone, MessageCircle, Clock, Info, Car, Navigation, Loader2 } from 'lucide-react'

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
  const [seats, setSeats] = useState(1)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [booking, setBooking] = useState(false)

  const isDriver = ride?.driver_id === user?.id

  const canTrackLive = !!ride && (ride.status === 'active' || ride.status === 'full')
  const isConfirmedPassenger = existingBooking?.status === 'confirmed'

  const locationSharing = useDriverLocationSharing(id || '')
  const liveDriverLocation = useLiveDriverLocation(
    id || '',
    canTrackLive && !isDriver && isConfirmedPassenger
  )

  useEffect(() => {
    if (id) {
      fetchRide()
    }
  }, [id])

  // Stop sharing location if the driver navigates away without pressing "Stop"
  useEffect(() => {
    return () => locationSharing.stop()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

    // Check for existing booking
    if (user) {
      const bookingData = await bookingsRepository.getActiveBookingForRide(id, user.id)
      if (bookingData) {
        setExistingBooking(bookingData)
      }
    }

    setLoading(false)
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

    if (seats > ride.available_seats) {
      toast({
        title: 'Not enough seats',
        description: `Only ${ride.available_seats} seats available.`,
        variant: 'destructive',
      })
      return
    }

    setBooking(true)

    const bookingFee = calculateBookingFee(ride.price) * seats

    // Get church attribution if user came from a church landing page
    const churchId = getStoredChurchId()

    // Create booking
    let bookingData: Booking
    try {
      bookingData = await bookingsRepository.createBooking({
        rideId: ride.id,
        passengerId: user.id,
        seatsBooked: seats,
        bookingFee,
        churchId, // Will be null if user didn't come from a church page
      })
    } catch (bookingError) {
      console.error('Booking error:', bookingError)
      toast({
        title: 'Booking failed',
        description: bookingError instanceof Error ? bookingError.message : 'Please try again.',
        variant: 'destructive',
      })
      setBooking(false)
      return
    }

    // Save phone number to profile if not already set
    if (!profile?.phone_number && phoneNumber) {
      await authRepository.updateUserProfile(user.id, { phone_number: phoneNumber })
    }

    setShowBookingDialog(false)
    toast({
      title: 'Booking created!',
      description: 'Please complete payment to confirm your seat.',
      variant: 'success',
    })

    // Navigate to payment page
    navigate(`/bookings/${bookingData.id}/pay`, { state: { phone: phoneNumber } })

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!ride) return null

  const bookingFee = calculateBookingFee(ride.price)
  const totalBookingFee = bookingFee * seats
  const cashPayment = (ride.price - bookingFee) * seats

  const isPastRide = new Date(ride.departure_time) < new Date()
  const rideIsBookable = !existingBooking && ride.available_seats > 0 && ride.status === 'active' && !isPastRide
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
      <div className="min-h-screen bg-background pb-40">
        {/* Header */}
        <div className="bg-navy-900 pt-12 pb-20 px-4">
          <PageContainer>
            <button
              onClick={() => navigate(-1)}
              className="flex items-center text-white/80 hover:text-white mb-4"
            >
              <ArrowLeft className="w-5 h-5 mr-1" />
              Back
            </button>
            <h1 className="text-xl font-semibold text-white">Ride Details</h1>
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

                {ride.notes && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{ride.notes}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Route Map */}
          {ride.origin_lat && ride.origin_lng && ride.destination_lat && ride.destination_lng && (
            <Card>
              <CardContent className="p-0 overflow-hidden">
                <MapView
                  origin={{
                    lat: ride.origin_lat,
                    lng: ride.origin_lng,
                    name: ride.origin_name,
                  }}
                  destination={{
                    lat: ride.destination_lat,
                    lng: ride.destination_lng,
                    name: ride.destination_name,
                  }}
                  showRoute={true}
                  height="200px"
                  driverLocation={!isDriver ? liveDriverLocation : null}
                />
              </CardContent>
            </Card>
          )}

          {/* Live Location Sharing - driver's own control */}
          {isDriver && canTrackLive && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Navigation className={`w-4 h-4 ${locationSharing.sharing ? 'text-green-600' : 'text-muted-foreground'}`} />
                  <span>
                    {locationSharing.sharing
                      ? 'Sharing your location with passengers'
                      : 'Share your location so passengers can see you coming'}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={locationSharing.sharing ? 'outline' : 'default'}
                  onClick={() => locationSharing.sharing ? locationSharing.stop() : locationSharing.start()}
                >
                  {locationSharing.sharing ? 'Stop' : 'Start'}
                </Button>
              </CardContent>
              {locationSharing.error && (
                <CardContent className="pt-0 pb-4 -mt-2">
                  <p className="text-xs text-destructive">{locationSharing.error}</p>
                </CardContent>
              )}
            </Card>
          )}

          {/* Live Location Sharing - passenger's status caption */}
          {!isDriver && canTrackLive && isConfirmedPassenger && !liveDriverLocation && (
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
            </CardContent>
          </Card>

          {/* Booking Status / Actions */}
          {existingBooking ? (
            <Card className={existingBooking.status === 'confirmed' ? 'border-green-500 bg-green-50' : 'border-yellow-500 bg-yellow-50'}>
              <CardContent className="p-5">
                {existingBooking.status === 'pending_payment' ? (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <Clock className="w-5 h-5 text-yellow-600" />
                      <span className="font-medium text-yellow-800">Payment Pending</span>
                    </div>
                    <p className="text-sm text-yellow-700 mb-4">
                      Complete payment to confirm your booking and access driver contact.
                    </p>
                    <Button
                      className="w-full"
                      onClick={() => navigate(`/bookings/${existingBooking.id}/pay`)}
                    >
                      Complete Payment ({formatCurrency(existingBooking.booking_fee)})
                    </Button>
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
                    <p className="text-sm text-green-700 mt-2 font-medium">
                      Pay {formatCurrency(cashPayment)} cash to driver after ride.
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
                  <ul className="space-y-1">
                    <li>1. Pay 10% booking fee ({formatCurrency(bookingFee)}/seat) via mobile money</li>
                    <li>2. Get driver's contact after payment</li>
                    <li>3. Pay remaining 90% ({formatCurrency(ride.price - bookingFee)}/seat) in cash to driver</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </PageContainer>
      </div>

      {/* Book Button - positioned above BottomNav */}
      {canBook && (
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t z-40">
          <PageContainer>
            <Button className="w-full" size="lg" onClick={() => setShowBookingDialog(true)}>
              Book Seat - {formatCurrency(bookingFee)} to reserve
            </Button>
          </PageContainer>
        </div>
      )}

      {/* Login to Book Button - for guests */}
      {showLoginToBook && (
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t z-40">
          <PageContainer>
            <Button
              className="w-full"
              size="lg"
              onClick={() => navigate('/login', { state: { from: `/rides/${id}` } })}
            >
              Sign In to Book - {formatCurrency(bookingFee)} to reserve
            </Button>
          </PageContainer>
        </div>
      )}

      {/* Booking Dialog */}
      <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book Your Seat</DialogTitle>
            <DialogDescription>
              Pay {formatCurrency(bookingFee)} per seat to reserve. You'll pay the remaining {formatCurrency(ride.price - bookingFee)} per seat in cash to the driver.
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

            <div className="space-y-2">
              <Label htmlFor="phone">Mobile money number</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="07XX XXX XXX"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                You'll receive a payment prompt on this number
              </p>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span>Booking fee ({seats} seat{seats > 1 ? 's' : ''})</span>
                <span className="font-medium">{formatCurrency(totalBookingFee)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Pay driver in cash</span>
                <span>{formatCurrency(cashPayment)}</span>
              </div>
              <div className="flex justify-between font-medium pt-2 border-t">
                <span>Total ride cost</span>
                <span>{formatCurrency(ride.price * seats)}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBookingDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleBook} loading={booking}>
              Pay {formatCurrency(totalBookingFee)}
            </Button>
          </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
