import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { rideRequestsRepository } from '@/shared/services/database'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { useToast } from '@/shared/hooks/use-toast'
import { PageContainer } from '@/shared/components/PageContainer'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import type { RideRequest } from '@/shared/types'
import { ArrowLeft, Calendar, Users, Wallet, MessageSquare } from 'lucide-react'

export default function RideRequestsPage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [requests, setRequests] = useState<RideRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [acceptTarget, setAcceptTarget] = useState<RideRequest | null>(null)
  const [departureTime, setDepartureTime] = useState('')
  const [accepting, setAccepting] = useState(false)

  const hasPhoneNumber = !!profile?.phone_number
  const hasFetched = useRef(false)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const data = await rideRequestsRepository.getOpenRideRequests()
      setRequests(data.filter((r) => r.passenger_id !== user?.id))
    } catch (error) {
      console.error('Error fetching ride requests:', error)
    }
    setLoading(false)
  }, [user?.id])

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchRequests()
    }
  }, [fetchRequests])

  const openAcceptDialog = (request: RideRequest) => {
    if (!user) {
      navigate('/login', { state: { from: '/requests' } })
      return
    }
    if (!hasPhoneNumber) {
      toast({
        title: 'Phone number required',
        description: 'Please add your phone number in your profile before accepting requests.',
        variant: 'destructive',
      })
      navigate('/profile')
      return
    }
    setAcceptTarget(request)
    // Default to the passenger's requested time, editable in case the driver's schedule is close but not exact.
    setDepartureTime(new Date(request.departure_time).toTimeString().slice(0, 5))
  }

  const handleAccept = async () => {
    if (!acceptTarget) return

    setAccepting(true)
    try {
      const requestDate = new Date(acceptTarget.departure_time).toISOString().split('T')[0]
      const departureDateTime = new Date(`${requestDate}T${departureTime}`)

      const rideId = await rideRequestsRepository.acceptRideRequest(acceptTarget.id, {
        departure_time: departureDateTime.toISOString(),
        price: acceptTarget.budget,
      })

      toast({
        title: 'Request accepted!',
        description: 'The passenger will be notified to complete payment.',
        variant: 'success',
      })
      setAcceptTarget(null)
      navigate(`/rides/${rideId}`)
    } catch (error) {
      console.error('Accept request error:', error)
      toast({
        title: 'Could not accept request',
        description: error instanceof Error ? error.message : 'It may have just been accepted by someone else.',
        variant: 'destructive',
      })
      setAcceptTarget(null)
      fetchRequests()
    }
    setAccepting(false)
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-navy-900 pt-12 pb-6 px-4">
        <PageContainer>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-white/80 hover:text-white mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back
          </button>
          <h1 className="text-xl font-semibold text-white">Ride Requests</h1>
          <p className="text-coral-100 text-sm mt-1">
            Passengers looking for a ride near your route — accept at their price, no back-and-forth.
          </p>
        </PageContainer>
      </div>

      <div className="px-4 mt-6">
        <PageContainer size="wide">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="skeleton h-24 rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : requests.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No open requests right now</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Check back later, or{' '}
                  <Link to="/rides/create" className="text-primary underline">
                    offer a ride
                  </Link>{' '}
                  of your own.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {requests.map((request) => (
                <Card key={request.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
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

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(request.departure_time)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {request.seats_needed} seat{request.seats_needed !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {request.notes && (
                      <p className="text-xs text-muted-foreground">{request.notes}</p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="flex items-center gap-1 font-medium text-coral-600">
                        <Wallet className="w-4 h-4" />
                        {formatCurrency(request.budget)}/seat
                      </span>
                      <Button size="sm" onClick={() => openAcceptDialog(request)}>
                        Accept
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </PageContainer>
      </div>

      {/* Accept Dialog */}
      <Dialog open={!!acceptTarget} onOpenChange={(open) => !open && setAcceptTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept This Request</DialogTitle>
            <DialogDescription>
              You'll offer this ride at the passenger's stated budget of{' '}
              {acceptTarget && formatCurrency(acceptTarget.budget)} per seat. This creates a real ride on
              your account, ready for the passenger to pay their booking fee.
            </DialogDescription>
          </DialogHeader>

          {acceptTarget && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p className="font-medium">{acceptTarget.origin_name} → {acceptTarget.destination_name}</p>
                <p className="text-muted-foreground">
                  {acceptTarget.seats_needed} seat{acceptTarget.seats_needed !== 1 ? 's' : ''} ·{' '}
                  {formatCurrency(acceptTarget.budget * acceptTarget.seats_needed)} total
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="departureTime">Departure time</Label>
                <Input
                  id="departureTime"
                  type="time"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Requested for {formatDate(acceptTarget.departure_time)}. Adjust if your schedule is close but not exact.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleAccept} loading={accepting}>
              Confirm Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
