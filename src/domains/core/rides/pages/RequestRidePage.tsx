import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { rideRequestsRepository } from '@/shared/services/database'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Card, CardContent } from '@/shared/ui/card'
import { LocationPicker } from '@/domains/core/rides/components/LocationPicker'
import { useMapPins } from '@/domains/core/rides/map/MapShellContext'
import { usePayments } from '@/shared/contexts/AppSettingsContext'
import { useToast } from '@/shared/hooks/use-toast'
import { PageContainer } from '@/shared/components/PageContainer'
import { formatCurrency, getErrorMessage } from '@/shared/lib/utils'
import { ArrowLeft, Info } from 'lucide-react'

interface Location {
  lat: number
  lng: number
  name: string
}

export default function RequestRidePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()
  const { paymentsEnabled } = usePayments()

  const prefill = location.state as { origin?: Location | null; destination?: Location | null } | null

  const [origin, setOrigin] = useState<Location | null>(prefill?.origin ?? null)
  const [destination, setDestination] = useState<Location | null>(prefill?.destination ?? null)
  useMapPins(origin, destination) // show the route's ends on the shared map
  const [departureDate, setDepartureDate] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  const [budget, setBudget] = useState('')
  const [seats, setSeats] = useState('1')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const now = new Date()
  const minDate = now.toISOString().split('T')[0]
  const minTime = departureDate === minDate ? now.toTimeString().slice(0, 5) : '00:00'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      toast({
        title: 'Not logged in',
        description: 'Please log in to post a ride request.',
        variant: 'destructive',
      })
      return
    }

    if (!origin || !destination) {
      toast({
        title: 'Missing locations',
        description: 'Please enter both pickup and drop-off locations.',
        variant: 'destructive',
      })
      return
    }

    const departureDateTime = new Date(`${departureDate}T${departureTime}`)
    if (departureDateTime <= new Date()) {
      toast({
        title: 'Invalid time',
        description: 'Your desired departure time must be in the future.',
        variant: 'destructive',
      })
      return
    }

    const budgetNum = parseInt(budget)
    if (isNaN(budgetNum) || budgetNum < 1000) {
      toast({
        title: 'Invalid budget',
        description: 'Please enter a valid budget per seat (minimum 1,000 UGX).',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)

    try {
      const request = await rideRequestsRepository.createRideRequest(user.id, {
        origin_name: origin.name,
        origin_lat: origin.lat,
        origin_lng: origin.lng,
        destination_name: destination.name,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        departure_time: departureDateTime.toISOString(),
        budget: budgetNum,
        seats_needed: parseInt(seats),
        notes: notes || undefined,
      })

      toast({
        title: 'Request posted!',
        description: "Drivers going your way can now accept it — you'll pay once one does.",
        variant: 'success',
      })
      navigate('/my-rides', { state: { tab: 'requests', highlight: request.id } })
    } catch (error) {
      console.error('Post request error:', error)
      toast({
        title: 'Failed to post request',
        description: getErrorMessage(error),
        variant: 'destructive',
      })
    }

    setLoading(false)
  }

  const budgetNum = parseInt(budget) || 0

  return (
    <div className="min-h-full bg-background pb-8">
      {/* Header */}
      <div className="bg-header text-header-foreground pt-12 max-md:pt-6 pb-6 px-4">
        <PageContainer>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-header-foreground/80 hover:text-header-foreground mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back
          </button>
          <h1 className="text-xl font-semibold text-header-foreground">Request a Ride</h1>
          <p className="text-header-foreground/80 text-sm mt-1">
            Can't find a ride? Post what you need and let drivers come to you.
          </p>
        </PageContainer>
      </div>

      {/* Form */}
      <div className="px-4 -mt-4">
        <PageContainer>
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Route */}
              <div className="space-y-3">
                <Label>Route</Label>
                <LocationPicker
                  value={origin}
                  onChange={setOrigin}
                  placeholder="Pickup location"
                  markerColor="pickup"
                />
                <LocationPicker
                  value={destination}
                  onChange={setDestination}
                  placeholder="Drop-off location"
                  markerColor="dropoff"
                />
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    min={minDate}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    min={minTime}
                    required
                  />
                </div>
              </div>

              {/* Budget & Seats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="budget">Your budget per seat (UGX)</Label>
                  <Input
                    id="budget"
                    type="number"
                    placeholder="e.g., 15000"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    min="1000"
                    step="500"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seats">Seats needed</Label>
                  <Input
                    id="seats"
                    type="number"
                    value={seats}
                    onChange={(e) => setSeats(e.target.value)}
                    min="1"
                    max="4"
                    required
                  />
                </div>
              </div>

              {budgetNum > 0 && (
                <div className="p-4 bg-coral-50 rounded-lg">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total budget ({seats} seat{seats !== '1' ? 's' : ''})</span>
                    <span className="font-semibold">{formatCurrency(budgetNum * (parseInt(seats) || 1))}</span>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <textarea
                  id="notes"
                  className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Anything a driver should know (e.g. flexible on time, luggage, etc.)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Info */}
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  Any driver going your way can accept at your stated budget — no back-and-forth.{' '}
                  {paymentsEnabled
                    ? "You'll pay the 10% booking fee once a driver accepts."
                    : "There's no booking fee: once a driver accepts, you pay them in cash after the ride."}
                </p>
              </div>

              <Button type="submit" className="w-full" loading={loading}>
                Post Request
              </Button>
            </form>
          </CardContent>
        </Card>
        </PageContainer>
      </div>
    </div>
  )
}
