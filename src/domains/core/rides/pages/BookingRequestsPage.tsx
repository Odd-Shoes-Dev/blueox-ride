import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, MapPin, Navigation, Users, Wallet } from 'lucide-react'
import { bookingRequestsRepository } from '@/shared/services/database'
import type { BookingRequestWithDetails } from '@/shared/services/database/bookingRequestsRepository'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs'
import { PageContainer } from '@/shared/components/PageContainer'
import { useToast } from '@/shared/hooks/use-toast'
import { formatCurrency, formatDate, getErrorMessage } from '@/shared/lib/utils'
import { formatDistance } from '@/domains/core/rides/hooks/useRideRouteOnMap'
import { haversineKm } from '@/domains/core/rides/lib/routeProgress'
import { useMapPins, useMapShell } from '@/domains/core/rides/map/MapShellContext'
import {
  DECLINE_REASON_LABELS,
  MAX_REQUEST_ATTEMPTS,
  useBookingRequests,
} from '@/domains/core/rides/requests/BookingRequestsContext'
import type { DeclineReason } from '@/shared/types'

const isExpired = (request: BookingRequestWithDetails) => new Date(request.expires_at).getTime() <= Date.now()
const isWaiting = (request: BookingRequestWithDetails) => request.status === 'pending' && !isExpired(request)

function timeLeft(expiresAt: string): string {
  const minutes = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`
}

// Where a request gets in and off: the passenger's own choice, or the ride's start/end.
function stopsOf(request: BookingRequestWithDetails) {
  const { ride } = request
  return {
    pickup: {
      name: request.pickup_name ?? ride.origin_name,
      lat: request.pickup_lat ?? ride.origin_lat,
      lng: request.pickup_lng ?? ride.origin_lng,
      custom: request.pickup_lat !== null,
    },
    dropoff: {
      name: request.dropoff_name ?? ride.destination_name,
      lat: request.dropoff_lat ?? ride.destination_lat,
      lng: request.dropoff_lng ?? ride.destination_lng,
      custom: request.dropoff_lat !== null,
    },
  }
}

const REASONS: DeclineReason[] = ['offer_too_low', 'pickup_too_far', 'seats_reserved', 'other']

// Booking requests: what drivers answer, and what riders sent. Every booking is a request —
// seats, pickup/drop-off and an offer — that the driver accepts or refuses; nothing is ever
// confirmed automatically. See docs/booking-requests.md.
export default function BookingRequestsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const shell = useMapShell()
  const { version, refresh } = useBookingRequests()

  const [forMe, setForMe] = useState<BookingRequestWithDetails[]>([])
  const [mine, setMine] = useState<BookingRequestWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [declineTarget, setDeclineTarget] = useState<BookingRequestWithDetails | null>(null)
  const [reason, setReason] = useState<DeclineReason>('offer_too_low')
  const [block, setBlock] = useState(false)

  const userId = user?.id
  const load = useCallback(async () => {
    if (!userId) return
    try {
      const [driverRows, passengerRows] = await Promise.all([
        bookingRequestsRepository.getRequestsForDriver(userId),
        bookingRequestsRepository.getRequestsForPassenger(userId),
      ])
      setForMe(driverRows)
      setMine(passengerRows)
    } catch (error) {
      console.error('Could not load booking requests:', error)
      toast({ title: 'Could not load requests', description: getErrorMessage(error), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
    // toast is stable enough for this; reload only when the user or the data version changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    load()
  }, [load, version])

  // Show the selected request's pickup and drop-off on the map behind the panel.
  const selected = forMe.find((request) => request.id === selectedId) ?? null
  const selectedStops = selected ? stopsOf(selected) : null
  useMapPins(
    selectedStops ? { lat: selectedStops.pickup.lat, lng: selectedStops.pickup.lng, name: selectedStops.pickup.name } : null,
    selectedStops ? { lat: selectedStops.dropoff.lat, lng: selectedStops.dropoff.lng, name: selectedStops.dropoff.name } : null
  )

  const toggleOnMap = (request: BookingRequestWithDetails) => {
    if (selectedId === request.id) {
      setSelectedId(null)
      return
    }
    setSelectedId(request.id)
    shell.previewRide(request.ride)
  }

  const accept = async (request: BookingRequestWithDetails) => {
    setBusyId(request.id)
    try {
      const outcome = await bookingRequestsRepository.respondToRequest(request.id, { accept: true })
      if (outcome === 'expired') {
        toast({ title: 'This request has expired', description: 'It ran out of time before it was answered.', variant: 'destructive' })
      } else {
        toast({
          title: 'Request accepted',
          description: `${request.passenger.full_name} is booked on your ride.`,
          variant: 'success',
        })
        shell.refreshMyRides()
      }
    } catch (error) {
      toast({ title: 'Could not accept', description: getErrorMessage(error), variant: 'destructive' })
    }
    setBusyId(null)
    refresh()
  }

  const decline = async () => {
    if (!declineTarget) return
    setBusyId(declineTarget.id)
    try {
      await bookingRequestsRepository.respondToRequest(declineTarget.id, { accept: false, reason, block })
      toast({ title: 'Request refused', description: 'The rider has been told.', variant: 'success' })
    } catch (error) {
      toast({ title: 'Could not refuse', description: getErrorMessage(error), variant: 'destructive' })
    }
    setBusyId(null)
    setDeclineTarget(null)
    setReason('offer_too_low')
    setBlock(false)
    refresh()
  }

  const withdraw = async (request: BookingRequestWithDetails) => {
    setBusyId(request.id)
    try {
      await bookingRequestsRepository.withdrawRequest(request.id)
      toast({ title: 'Request withdrawn' })
    } catch (error) {
      toast({ title: 'Could not withdraw', description: getErrorMessage(error), variant: 'destructive' })
    }
    setBusyId(null)
    refresh()
  }

  // Highest offer first — a driver can hold several requests for the same seats at once now
  // (there's no more instant, first-come-first-served booking), so put the best one up top.
  const waitingForMe = forMe.filter(isWaiting).sort((a, b) => b.offer_price - a.offer_price)
  const answeredForMe = forMe.filter((request) => !isWaiting(request))

  return (
    <div className="min-h-full bg-background pb-8">
      <div className="bg-header text-header-foreground pt-12 max-md:pt-6 pb-6 px-4">
        <PageContainer>
          <h1 className="text-xl font-semibold text-header-foreground">Booking requests</h1>
          <p className="text-header-foreground/80 text-sm mt-1">
            Riders asking for a seat with their own pickup, drop-off and offer.
          </p>
        </PageContainer>
      </div>

      <div className="px-4 mt-4">
        <PageContainer>
          <Tabs defaultValue="driver">
            <TabsList className="w-full">
              <TabsTrigger value="driver" className="flex-1">
                For my rides ({waitingForMe.length})
              </TabsTrigger>
              <TabsTrigger value="mine" className="flex-1">
                My requests ({mine.filter(isWaiting).length})
              </TabsTrigger>
            </TabsList>

            {/* ---------- Requests to the driver ---------- */}
            <TabsContent value="driver" className="mt-4 space-y-3">
              {loading ? (
                <div className="skeleton h-40 rounded-lg" />
              ) : waitingForMe.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">No requests waiting</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      When a rider asks for a seat with their own stops or offer, it shows up here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                waitingForMe.map((request) => {
                  const { pickup, dropoff } = stopsOf(request)
                  const { ride } = request
                  const rideOrigin = { lat: ride.origin_lat, lng: ride.origin_lng }
                  const rideEnd = { lat: ride.destination_lat, lng: ride.destination_lng }
                  const pickupFromStart = haversineKm(rideOrigin, pickup)
                  const dropoffFromEnd = haversineKm(rideEnd, dropoff)
                  const theirTrip = haversineKm(pickup, dropoff)
                  const wholeRoute = haversineKm(rideOrigin, rideEnd)
                  const listedTotal = ride.price * request.seats
                  const offerTotal = request.offer_price * request.seats
                  const difference = request.offer_price - ride.price
                  const busy = busyId === request.id

                  return (
                    <Card key={request.id} className={selectedId === request.id ? 'ring-2 ring-primary' : ''}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{request.passenger.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {request.passenger.average_rating ? `★ ${request.passenger.average_rating.toFixed(1)} · ` : ''}
                              {request.passenger.total_rides} trip{request.passenger.total_rides === 1 ? '' : 's'}
                              {request.attempt_no > 1 ? ` · attempt ${request.attempt_no} of ${MAX_REQUEST_ATTEMPTS}` : ''}
                            </p>
                          </div>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
                            <Clock className="w-3 h-3" /> {timeLeft(request.expires_at)} left
                          </span>
                        </div>

                        <div className="text-sm space-y-1">
                          <p className="text-xs text-muted-foreground">
                            Your ride: {ride.origin_name} → {ride.destination_name} · {formatDate(ride.departure_time)}
                          </p>
                          <p className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
                            <span>
                              <span className="font-medium">{pickup.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {pickup.custom
                                  ? `Gets in about ${formatDistance(pickupFromStart)} from your start`
                                  : 'Gets in at your start'}
                              </span>
                            </span>
                          </p>
                          <p className="flex items-start gap-2">
                            <Navigation className="w-4 h-4 mt-0.5 text-navy-900 flex-shrink-0" />
                            <span>
                              <span className="font-medium">{dropoff.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {dropoff.custom
                                  ? `Gets off about ${formatDistance(dropoffFromEnd)} from your destination`
                                  : 'Gets off at your destination'}
                              </span>
                            </span>
                          </p>
                          {(pickup.custom || dropoff.custom) && (
                            <p className="text-xs text-muted-foreground pl-6">
                              Their trip: about {formatDistance(theirTrip)} of your {formatDistance(wholeRoute)} route (straight-line)
                            </p>
                          )}
                        </div>

                        <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Users className="w-4 h-4" /> {request.seats} seat{request.seats > 1 ? 's' : ''}
                            </span>
                            <span className="flex items-center gap-1 font-semibold">
                              <Wallet className="w-4 h-4" /> Offers {formatCurrency(request.offer_price)}/seat
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Your price: {formatCurrency(ride.price)}/seat</span>
                            <span>
                              {difference === 0
                                ? 'Matches your price'
                                : difference < 0
                                  ? `${formatCurrency(-difference)} lower`
                                  : `${formatCurrency(difference)} higher`}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              You'd receive in cash{request.seats > 1 ? ` (${request.seats} seats)` : ''}
                            </span>
                            <span className="font-medium">
                              {formatCurrency(offerTotal)}
                              {offerTotal !== listedTotal ? ` (listed ${formatCurrency(listedTotal)})` : ''}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button className="flex-1" onClick={() => accept(request)} loading={busy}>
                            Accept
                          </Button>
                          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setDeclineTarget(request)}>
                            Refuse
                          </Button>
                        </div>
                        <Button variant="ghost" size="sm" className="w-full" onClick={() => toggleOnMap(request)}>
                          {selectedId === request.id ? 'Hide on map' : 'Show on map'}
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })
              )}

              {answeredForMe.length > 0 && (
                <>
                  <p className="text-sm font-medium pt-2">Answered</p>
                  {answeredForMe.slice(0, 20).map((request) => (
                    <Card key={request.id}>
                      <CardContent className="p-3 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{request.passenger.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {request.ride.origin_name} → {request.ride.destination_name} · {formatCurrency(request.offer_price)}/seat
                          </p>
                        </div>
                        <StatusPill request={request} />
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </TabsContent>

            {/* ---------- Requests the rider sent ---------- */}
            <TabsContent value="mine" className="mt-4 space-y-3">
              {loading ? (
                <div className="skeleton h-32 rounded-lg" />
              ) : mine.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">You haven't sent any requests</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Open a ride and choose your own pickup, drop-off or offer to ask the driver.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                mine.map((request) => (
                  <Card key={request.id}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">
                            {request.ride.origin_name} → {request.ride.destination_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(request.ride.departure_time)} · {request.seats} seat{request.seats > 1 ? 's' : ''} · you offered{' '}
                            {formatCurrency(request.offer_price)}/seat (listed {formatCurrency(request.ride.price)})
                          </p>
                        </div>
                        <StatusPill request={request} />
                      </div>
                      {request.status === 'declined' && request.decline_reason && (
                        <p className="text-xs text-muted-foreground">{DECLINE_REASON_LABELS[request.decline_reason]}.</p>
                      )}
                      <div className="flex gap-2">
                        <Button asChild variant="outline" size="sm" className="flex-1">
                          <Link to={`/rides/${request.ride_id}`}>Open ride</Link>
                        </Button>
                        {isWaiting(request) && (
                          <Button variant="ghost" size="sm" disabled={busyId === request.id} onClick={() => withdraw(request)}>
                            Withdraw
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </PageContainer>
      </div>

      {/* ---------- Refuse dialog ---------- */}
      <Dialog open={declineTarget !== null} onOpenChange={(open) => !open && setDeclineTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuse this request?</DialogTitle>
            <DialogDescription>
              {declineTarget?.passenger.full_name} will see your reason. They can try again, with a different offer or
              stops, up to {MAX_REQUEST_ATTEMPTS} times on this ride.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {REASONS.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="decline-reason" checked={reason === option} onChange={() => setReason(option)} />
                {DECLINE_REASON_LABELS[option]}
              </label>
            ))}
            <label className="flex items-start gap-2 text-sm cursor-pointer pt-2 border-t">
              <input type="checkbox" className="mt-1" checked={block} onChange={(e) => setBlock(e.target.checked)} />
              <span>
                Don't accept any more requests or bookings from this person on this ride
                <span className="block text-xs text-muted-foreground">Use this if you don't want them to ask again.</span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineTarget(null)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={decline} loading={busyId === declineTarget?.id}>
              Refuse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusPill({ request }: { request: BookingRequestWithDetails }) {
  const expired = request.status === 'pending' && isExpired(request)
  const status = expired ? 'expired' : request.status
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    accepted: 'bg-green-100 text-green-800',
    declined: 'bg-red-100 text-red-800',
    withdrawn: 'bg-gray-100 text-gray-800',
    expired: 'bg-gray-100 text-gray-800',
  }
  const labels: Record<string, string> = {
    pending: 'Waiting',
    accepted: 'Accepted',
    declined: 'Refused',
    withdrawn: 'Withdrawn',
    expired: 'Expired',
  }
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${styles[status]}`}>{labels[status]}</span>
  )
}
