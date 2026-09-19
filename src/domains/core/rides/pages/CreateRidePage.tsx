import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ridesRepository, carPhotosRepository } from '@/shared/services/database'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Card, CardContent } from '@/shared/ui/card'
import { LocationPicker } from '@/domains/core/rides/components/LocationPicker'
import { CarPhotoUpload } from '@/domains/core/rides/components/CarPhotoUpload'
import { useToast } from '@/shared/hooks/use-toast'
import { PageContainer } from '@/shared/components/PageContainer'
import { formatCurrency, calculateBookingFee } from '@/shared/lib/utils'
import { ArrowLeft, Info, Car, Check } from 'lucide-react'
import type { CarPhoto } from '@/shared/types'

interface Location {
  lat: number
  lng: number
  name: string
}

export default function CreateRidePage() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [origin, setOrigin] = useState<Location | null>(null)
  const [destination, setDestination] = useState<Location | null>(null)
  const [departureDate, setDepartureDate] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  const [price, setPrice] = useState('')
  const [seats, setSeats] = useState('3')
  const [notes, setNotes] = useState('')
  const [carBrand, setCarBrand] = useState('')
  const [carModel, setCarModel] = useState('')
  const [carYear, setCarYear] = useState('')
  const [loading, setLoading] = useState(false)
  const [carPhotos, setCarPhotos] = useState<CarPhoto[]>([])
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [showPhotoUpload, setShowPhotoUpload] = useState(false)

  // Check if user has phone number for driver contact
  const hasPhoneNumber = !!profile?.phone_number

  // Fetch existing car photos on mount
  useEffect(() => {
    if (user) {
      fetchCarPhotos()
    }
  }, [user])

  const fetchCarPhotos = async () => {
    if (!user) return

    try {
      const data = await carPhotosRepository.getCarPhotosForDriver(user.id)
      setCarPhotos(data)
      // Auto-select primary photo if exists
      const primaryPhoto = data.find((p) => p.is_primary)
      if (primaryPhoto) {
        setSelectedPhotoId(primaryPhoto.id)
      }
    } catch (error) {
      console.error('Error fetching car photos:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) {
      toast({
        title: 'Not logged in',
        description: 'Please log in to create a ride.',
        variant: 'destructive',
      })
      return
    }

    if (!hasPhoneNumber) {
      toast({
        title: 'Phone number required',
        description: 'Please add your phone number in your profile before offering rides.',
        variant: 'destructive',
      })
      navigate('/profile')
      return
    }

    // Validate locations
    if (!origin || !destination) {
      toast({
        title: 'Missing locations',
        description: 'Please enter both pickup and drop-off locations.',
        variant: 'destructive',
      })
      return
    }

    // Use coordinates from selected locations (default to Uganda center if somehow missing)
    const originLat = origin.lat || 0.3476
    const originLng = origin.lng || 32.5825
    const destLat = destination.lat || 0.3476
    const destLng = destination.lng || 32.5825

    const departureDateTime = new Date(`${departureDate}T${departureTime}`)

    if (departureDateTime <= new Date()) {
      toast({
        title: 'Invalid departure time',
        description: 'Departure time must be in the future.',
        variant: 'destructive',
      })
      return
    }

    const priceNum = parseInt(price)
    if (isNaN(priceNum) || priceNum < 1000) {
      toast({
        title: 'Invalid price',
        description: 'Please enter a valid price (minimum 1,000 UGX).',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)

    try {
      const ride = await ridesRepository.createRide(
        user.id,
        {
          origin_name: origin.name,
          origin_lat: originLat,
          origin_lng: originLng,
          destination_name: destination.name,
          destination_lat: destLat,
          destination_lng: destLng,
          departure_time: departureDateTime.toISOString(),
          price: priceNum,
          total_seats: parseInt(seats),
          notes: notes || undefined,
          car_brand: carBrand || undefined,
          car_model: carModel || undefined,
          car_year: carYear ? parseInt(carYear) : undefined,
        },
        selectedPhotoId
      )

      toast({
        title: 'Ride created!',
        description: 'Your ride has been published.',
        variant: 'success',
      })
      navigate(`/rides/${ride.id}`)
    } catch (error) {
      console.error('Create ride error:', error)
      toast({
        title: 'Failed to create ride',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    }

    setLoading(false)
  }

  const priceNum = parseInt(price) || 0
  const bookingFee = calculateBookingFee(priceNum)

  // Get minimum date and time
  const now = new Date()
  const minDate = now.toISOString().split('T')[0]
  const minTime = departureDate === minDate ? now.toTimeString().slice(0, 5) : '00:00'

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="bg-header text-header-foreground pt-12 pb-6 px-4">
        <PageContainer>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-header-foreground/80 hover:text-header-foreground mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back
          </button>
          <h1 className="text-xl font-semibold text-header-foreground">Offer a Ride</h1>
          <p className="text-header-foreground/80 text-sm mt-1">
            Share your journey with other travelers
          </p>
        </PageContainer>
      </div>

      {/* Form */}
      <div className="px-4 -mt-4">
        <PageContainer>
        <Card>
          <CardContent className="pt-6">
            {!hasPhoneNumber && (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Phone number required:</strong> Please add your phone number in your profile before offering rides. Passengers need to contact you.
                </p>
                <Button
                  variant="link"
                  className="p-0 h-auto text-yellow-800 underline"
                  onClick={() => navigate('/profile')}
                >
                  Go to profile
                </Button>
              </div>
            )}

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

              {/* Price & Seats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="price">Price per seat (UGX)</Label>
                  <Input
                    id="price"
                    type="number"
                    placeholder="e.g., 15000"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    min="1000"
                    step="500"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seats">Available seats</Label>
                  <Input
                    id="seats"
                    type="number"
                    value={seats}
                    onChange={(e) => setSeats(e.target.value)}
                    min="1"
                    max="8"
                    required
                  />
                </div>
              </div>

              {/* Price Breakdown */}
              {priceNum > 0 && (
                <div className="p-4 bg-coral-50 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Your price per seat</span>
                    <span className="font-medium">{formatCurrency(priceNum)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Passenger pays to book (10%)</span>
                    <span className="text-navy-900">{formatCurrency(bookingFee)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-coral-200">
                    <span className="text-muted-foreground">You receive in cash (90%)</span>
                    <span className="font-semibold">{formatCurrency(priceNum - bookingFee)}</span>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <textarea
                  id="notes"
                  className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Any additional info (e.g., luggage space, pickup point details)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Car Info */}
              <div className="space-y-3">
                <Label>Car Details (optional)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="carBrand" className="text-sm">Brand</Label>
                    <Input
                      id="carBrand"
                      type="text"
                      placeholder="e.g., Toyota"
                      value={carBrand}
                      onChange={(e) => setCarBrand(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="carModel" className="text-sm">Model</Label>
                    <Input
                      id="carModel"
                      type="text"
                      placeholder="e.g., Corolla"
                      value={carModel}
                      onChange={(e) => setCarModel(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="carYear" className="text-sm">Year</Label>
                  <Input
                    id="carYear"
                    type="number"
                    placeholder="e.g., 2022"
                    value={carYear}
                    onChange={(e) => setCarYear(e.target.value)}
                    min="1990"
                    max={new Date().getFullYear() + 1}
                  />
                </div>
              </div>

              {/* Car Photo */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Car Photo (optional)</Label>
                  {carPhotos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowPhotoUpload(!showPhotoUpload)}
                      className="text-sm text-primary hover:underline"
                    >
                      {showPhotoUpload ? 'Cancel' : 'Manage Photos'}
                    </button>
                  )}
                </div>

                {showPhotoUpload ? (
                  <CarPhotoUpload
                    photos={carPhotos}
                    onPhotosChange={(photos) => {
                      setCarPhotos(photos)
                      // Auto-select new photo if none selected
                      if (!selectedPhotoId && photos.length > 0) {
                        setSelectedPhotoId(photos[0].id)
                      }
                    }}
                    maxPhotos={3}
                  />
                ) : carPhotos.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setShowPhotoUpload(true)}
                    className="w-full p-4 border-2 border-dashed border-muted-foreground/25 rounded-lg flex flex-col items-center gap-2 hover:border-muted-foreground/50 transition-colors"
                  >
                    <Car className="w-8 h-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Add car photos</span>
                    <span className="text-xs text-muted-foreground">Help passengers identify your car</span>
                  </button>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {carPhotos.map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => setSelectedPhotoId(selectedPhotoId === photo.id ? null : photo.id)}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                          selectedPhotoId === photo.id
                            ? 'border-coral-500 ring-2 ring-coral-500/20'
                            : 'border-transparent hover:border-muted-foreground/30'
                        }`}
                      >
                        <img
                          src={photo.photo_url}
                          alt="Car"
                          className="w-full h-full object-cover"
                        />
                        {selectedPhotoId === photo.id && (
                          <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-coral-500 flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {carPhotos.length > 0 && !showPhotoUpload && (
                  <p className="text-xs text-muted-foreground">
                    {selectedPhotoId ? 'Photo will be shown with your ride' : 'Tap a photo to select it for this ride'}
                  </p>
                )}
              </div>

              {/* Info */}
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <p>
                  Passengers pay 10% booking fee online. You collect the remaining 90% in cash after the ride.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full"
                loading={loading}
                disabled={!hasPhoneNumber}
              >
                Publish Ride
              </Button>
            </form>
          </CardContent>
        </Card>
        </PageContainer>
      </div>
    </div>
  )
}
