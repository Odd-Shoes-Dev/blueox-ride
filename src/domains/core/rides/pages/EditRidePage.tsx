import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ridesRepository, carPhotosRepository } from '@/shared/services/database'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Card, CardContent } from '@/shared/ui/card'
import { LocationPicker } from '@/domains/core/rides/components/LocationPicker'
import { useMapPins } from '@/domains/core/rides/map/MapShellContext'
import { CarPhotoUpload } from '@/domains/core/rides/components/CarPhotoUpload'
import { useToast } from '@/shared/hooks/use-toast'
import { PageContainer } from '@/shared/components/PageContainer'
import { getErrorMessage } from '@/shared/lib/utils'
import { ArrowLeft, Info, Car, Check, Loader2, Lock } from 'lucide-react'
import type { CarPhoto } from '@/shared/types'

interface Location {
  lat: number
  lng: number
  name: string
}

// Edit a ride already posted. Route, date/time, price and seat count can only change while
// nothing has taken a seat on the ride yet (no booking, no manual seat adjustment) — the
// database enforces this (guard_ride_edit, migration 13); this page mirrors that rule so a
// driver sees it up front rather than after submitting. Notes and car details can always be
// changed. See docs/ride-editing.md.
export default function EditRidePage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [fullyEditable, setFullyEditable] = useState(false)

  const [origin, setOrigin] = useState<Location | null>(null)
  const [destination, setDestination] = useState<Location | null>(null)
  useMapPins(origin, destination) // show the route's ends on the shared map
  const [departureDate, setDepartureDate] = useState('')
  const [departureTime, setDepartureTime] = useState('')
  const [price, setPrice] = useState('')
  const [seats, setSeats] = useState('3')
  const [notes, setNotes] = useState('')
  const [carBrand, setCarBrand] = useState('')
  const [carModel, setCarModel] = useState('')
  const [carYear, setCarYear] = useState('')
  const [saving, setSaving] = useState(false)
  const [carPhotos, setCarPhotos] = useState<CarPhoto[]>([])
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [showPhotoUpload, setShowPhotoUpload] = useState(false)

  useEffect(() => {
    if (!id || !user) return
    let cancelled = false

    Promise.all([ridesRepository.getRideForEdit(id), carPhotosRepository.getCarPhotosForDriver(user.id)])
      .then(([ride, photos]) => {
        if (cancelled) return
        if (!ride || ride.driver_id !== user.id) {
          setNotFound(true)
          return
        }
        setFullyEditable(ride.fullyEditable)
        setOrigin({ lat: ride.origin_lat, lng: ride.origin_lng, name: ride.origin_name })
        setDestination({ lat: ride.destination_lat, lng: ride.destination_lng, name: ride.destination_name })
        const departure = new Date(ride.departure_time)
        setDepartureDate(departure.toISOString().split('T')[0])
        setDepartureTime(departure.toTimeString().slice(0, 5))
        setPrice(String(ride.price))
        setSeats(String(ride.total_seats))
        setNotes(ride.notes ?? '')
        setCarBrand(ride.car_brand ?? '')
        setCarModel(ride.car_model ?? '')
        setCarYear(ride.car_year ? String(ride.car_year) : '')
        setCarPhotos(photos)
        setSelectedPhotoId(ride.car_photo_id ?? photos.find((p) => p.is_primary)?.id ?? null)
      })
      .catch(() => setNotFound(true))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return

    const carDetails = {
      notes: notes || null,
      car_brand: carBrand || null,
      car_model: carModel || null,
      car_year: carYear ? parseInt(carYear) : null,
      car_photo_id: selectedPhotoId,
    }

    if (!fullyEditable) {
      setSaving(true)
      const { error } = await ridesRepository.updateRide(id, carDetails)
      setSaving(false)
      if (error) {
        toast({ title: 'Could not save changes', description: getErrorMessage(error), variant: 'destructive' })
        return
      }
      toast({ title: 'Ride updated', variant: 'success' })
      navigate(`/rides/${id}`)
      return
    }

    if (!origin || !destination) {
      toast({
        title: 'Missing locations',
        description: !origin ? 'Pickup location is missing.' : 'Drop-off location is missing.',
        variant: 'destructive',
      })
      return
    }

    const departureDateTime = new Date(`${departureDate}T${departureTime}`)
    if (departureDateTime <= new Date()) {
      toast({ title: 'Invalid departure time', description: 'Departure time must be in the future.', variant: 'destructive' })
      return
    }

    const priceNum = parseInt(price)
    if (isNaN(priceNum) || priceNum < 1000) {
      toast({ title: 'Invalid price', description: 'Please enter a valid price (minimum 1,000 UGX).', variant: 'destructive' })
      return
    }

    const seatsNum = parseInt(seats)
    if (isNaN(seatsNum) || seatsNum < 1 || seatsNum > 8) {
      toast({ title: 'Invalid seat count', description: 'Seats must be between 1 and 8.', variant: 'destructive' })
      return
    }

    setSaving(true)
    const { error } = await ridesRepository.updateRide(id, {
      origin_name: origin.name,
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      destination_name: destination.name,
      destination_lat: destination.lat,
      destination_lng: destination.lng,
      departure_time: departureDateTime.toISOString(),
      price: priceNum,
      total_seats: seatsNum,
      ...carDetails,
    })
    setSaving(false)

    if (error) {
      toast({
        title: 'Could not save changes',
        description:
          getErrorMessage(error) ||
          'This ride may already have a booking. Refresh and try again — only notes and car details can change after that.',
        variant: 'destructive',
      })
      return
    }

    toast({ title: 'Ride updated', variant: 'success' })
    navigate(`/rides/${id}`)
  }

  const now = new Date()
  const minDate = now.toISOString().split('T')[0]
  const minTime = departureDate === minDate ? now.toTimeString().slice(0, 5) : '00:00'

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading ride...
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center gap-3 py-16 text-center px-4">
        <p className="text-muted-foreground">This ride can't be edited.</p>
        <Button onClick={() => navigate('/my-rides')}>Back to My Rides</Button>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-background pb-8">
      <div className="bg-header text-header-foreground pt-12 max-md:pt-6 pb-6 px-4">
        <PageContainer>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-header-foreground/80 hover:text-header-foreground mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back
          </button>
          <h1 className="text-xl font-semibold text-header-foreground">Edit Ride</h1>
          <p className="text-header-foreground/80 text-sm mt-1">
            {fullyEditable ? 'Update your ride' : 'Update your notes and car details'}
          </p>
        </PageContainer>
      </div>

      <div className="px-4 -mt-4">
        <PageContainer>
          <Card>
            <CardContent className="pt-6">
              {!fullyEditable && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex gap-3">
                  <Lock className="w-4 h-4 mt-0.5 shrink-0 text-yellow-800" />
                  <p className="text-sm text-yellow-800">
                    Someone has already booked this ride (or you've adjusted its seats), so the route, date/time,
                    price and seat count are locked. You can still update notes and car details. Use the seat
                    controls on My Rides for changes on the road.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {fullyEditable && (
                  <>
                    <div className="space-y-3">
                      <Label>Route</Label>
                      <LocationPicker value={origin} onChange={setOrigin} placeholder="Pickup location" markerColor="pickup" />
                      <LocationPicker
                        value={destination}
                        onChange={setDestination}
                        placeholder="Drop-off location"
                        markerColor="dropoff"
                      />
                    </div>

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

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="price">Price per seat (UGX)</Label>
                        <Input
                          id="price"
                          type="number"
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
                  </>
                )}

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

                <div className="space-y-3">
                  <Label>Car Details (optional)</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="carBrand" className="text-sm">Brand</Label>
                      <Input id="carBrand" type="text" placeholder="e.g., Toyota" value={carBrand} onChange={(e) => setCarBrand(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="carModel" className="text-sm">Model</Label>
                      <Input id="carModel" type="text" placeholder="e.g., Corolla" value={carModel} onChange={(e) => setCarModel(e.target.value)} />
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
                        if (!selectedPhotoId && photos.length > 0) setSelectedPhotoId(photos[0].id)
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
                          <img src={photo.photo_url} alt="Car" className="w-full h-full object-cover" />
                          {selectedPhotoId === photo.id && (
                            <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-coral-500 flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {fullyEditable && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>Once someone books a seat, the route, date/time, price and seat count lock — only notes and car details stay editable.</p>
                  </div>
                )}

                <Button type="submit" className="w-full" loading={saving}>
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>
        </PageContainer>
      </div>
    </div>
  )
}
