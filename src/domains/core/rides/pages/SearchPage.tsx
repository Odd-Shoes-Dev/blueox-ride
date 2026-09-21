import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ridesRepository } from '@/shared/services/database'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { LocationPicker } from '@/domains/core/rides/components/LocationPicker'
import { useMapPins } from '@/domains/core/rides/map/MapShellContext'
import { RidesMapView } from '@/domains/core/rides/components/RidesMapView'
import { SearchPageSEO } from '@/shared/components/SEO'
import { PageContainer } from '@/shared/components/PageContainer'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import { Search, Calendar, Users, Star, Filter, X, Map, Route } from 'lucide-react'

interface Location {
  lat: number
  lng: number
  name: string
}

type RideWithDriver = ridesRepository.RideWithDriverRow

export default function SearchPage() {
  const navigate = useNavigate()
  const [origin, setOrigin] = useState<Location | null>(null)
  const [destination, setDestination] = useState<Location | null>(null)
  useMapPins(origin, destination) // show the route's ends on the shared map
  const [date, setDate] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [minSeats, setMinSeats] = useState('1')
  const [showFilters, setShowFilters] = useState(false)
  const [showMapView, setShowMapView] = useState(false)
  const [rides, setRides] = useState<RideWithDriver[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = async () => {
    setLoading(true)
    setHasSearched(true)

    try {
      const data = await ridesRepository.searchActiveRides({
        originName: origin?.name,
        destinationName: destination?.name,
        date: date || undefined,
        maxPrice: maxPrice ? parseInt(maxPrice) : undefined,
        minSeats: parseInt(minSeats) || 1,
        limit: 50,
      })
      setRides(data)
    } catch (error) {
      console.error('Search error:', error)
    }

    setLoading(false)
  }

  const clearFilters = () => {
    setOrigin(null)
    setDestination(null)
    setDate('')
    setMaxPrice('')
    setMinSeats('1')
  }

  const hasActiveFilters = origin || destination || date || maxPrice || minSeats !== '1'

  // Handle ride selection from map
  const handleRideSelect = (rideId: string) => {
    setShowMapView(false)
    navigate(`/rides/${rideId}`)
  }

  // Prepare rides data for map view
  const ridesForMap = rides.map(ride => ({
    id: ride.id,
    origin_name: ride.origin_name,
    origin_lat: ride.origin_lat || 0,
    origin_lng: ride.origin_lng || 0,
    destination_name: ride.destination_name,
    destination_lat: ride.destination_lat || 0,
    destination_lng: ride.destination_lng || 0,
    departure_time: ride.departure_time,
    price: ride.price,
    available_seats: ride.available_seats,
    driver_name: ride.driver_name,
  }))

  return (
    <>
      <SearchPageSEO />
      <div className="min-h-full bg-background pb-8">
        {/* Header */}
        <div className="bg-header text-header-foreground pt-12 max-md:pt-6 pb-6 px-4">
          <PageContainer>
            <h1 className="text-xl font-semibold text-header-foreground mb-4">Search Rides</h1>

          {/* Main Search */}
          <div className="space-y-3">
            <LocationPicker
              value={origin}
              onChange={setOrigin}
              placeholder="From where?"
              markerColor="pickup"
            />
            <LocationPicker
              value={destination}
              onChange={setDestination}
              placeholder="To where?"
              markerColor="dropoff"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-shrink-0"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4 mr-2" />
                Filters
                {hasActiveFilters && (
                  <span className="ml-2 w-5 h-5 bg-navy-900 text-white rounded-full text-xs flex items-center justify-center">
                    !
                  </span>
                )}
              </Button>
              <Button className="flex-1" onClick={handleSearch}>
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
            </div>
          </div>
          </PageContainer>
        </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="px-4 py-4 bg-muted border-b">
          <PageContainer className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Filters</span>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="w-4 h-4 mr-1" />
                Clear
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="date" className="text-xs">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="minSeats" className="text-xs">Min Seats</Label>
                <Input
                  id="minSeats"
                  type="number"
                  min="1"
                  max="8"
                  value={minSeats}
                  onChange={(e) => setMinSeats(e.target.value)}
                />
              </div>
              <div className="space-y-1 col-span-2">
                <Label htmlFor="maxPrice" className="text-xs">Max Price (UGX)</Label>
                <Input
                  id="maxPrice"
                  type="number"
                  placeholder="e.g., 50000"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </div>
            </div>
          </PageContainer>
        </div>
      )}

      {/* Results */}
      <div className="px-4 mt-4">
        <PageContainer size="wide">
          {loading ? (
            <div className="grid grid-cols-1 gap-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="skeleton h-20 rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !hasSearched ? (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                Enter your route to find available rides
              </p>
            </div>
          ) : rides.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-2">No rides found</p>
              <p className="text-sm text-muted-foreground mb-4">
                Try adjusting your search criteria
              </p>
              <Button
                variant="outline"
                onClick={() => navigate('/requests/new', { state: { origin, destination } })}
              >
                Post a ride request instead
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">
                  {rides.length} ride{rides.length !== 1 ? 's' : ''} found
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMapView(true)}
                  className="flex items-center gap-1"
                >
                  <Map className="w-4 h-4" />
                  View on Map
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {rides.map((ride) => (
                  <RideCard key={ride.id} ride={ride} userOrigin={origin} userDestination={destination} />
                ))}
              </div>
            </>
          )}
        </PageContainer>
      </div>

        {/* Map View Modal */}
        <RidesMapView
          isOpen={showMapView}
          onClose={() => setShowMapView(false)}
          rides={ridesForMap}
          userOrigin={origin}
          userDestination={destination}
          onRideSelect={handleRideSelect}
        />
      </div>
    </>
  )
}

// Calculate distance between two points in km using Haversine formula
function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Check if user's route is "along the way" of the driver's route
function isAlongTheWay(
  ride: RideWithDriver,
  userOrigin: Location | null,
  userDestination: Location | null
): { match: boolean; type: 'exact' | 'origin' | 'destination' | 'partial' | 'none' } {
  if (!userOrigin || !userDestination || !ride.origin_lat || !ride.destination_lat) {
    return { match: false, type: 'none' }
  }

  const THRESHOLD_KM = 5 // Within 5km is considered "along the way"

  const originToRideOrigin = getDistance(userOrigin.lat, userOrigin.lng, ride.origin_lat, ride.origin_lng || 0)
  const destToRideDest = getDistance(userDestination.lat, userDestination.lng, ride.destination_lat, ride.destination_lng || 0)

  // Exact match - both origin and destination are close
  if (originToRideOrigin < THRESHOLD_KM && destToRideDest < THRESHOLD_KM) {
    return { match: true, type: 'exact' }
  }

  // Same origin, different destination (user can get dropped off along the way)
  if (originToRideOrigin < THRESHOLD_KM && destToRideDest >= THRESHOLD_KM) {
    // Check if user's destination is between ride's origin and destination
    const rideDistance = getDistance(ride.origin_lat, ride.origin_lng || 0, ride.destination_lat, ride.destination_lng || 0)
    const userDestToRideRoute = Math.min(
      getDistance(userDestination.lat, userDestination.lng, ride.origin_lat, ride.origin_lng || 0),
      getDistance(userDestination.lat, userDestination.lng, ride.destination_lat, ride.destination_lng || 0)
    )
    if (userDestToRideRoute < rideDistance * 0.3) { // Within 30% of route distance
      return { match: true, type: 'origin' }
    }
  }

  // Different origin, same destination (user can be picked up along the way)
  if (originToRideOrigin >= THRESHOLD_KM && destToRideDest < THRESHOLD_KM) {
    const rideDistance = getDistance(ride.origin_lat, ride.origin_lng || 0, ride.destination_lat, ride.destination_lng || 0)
    const userOriginToRideRoute = Math.min(
      getDistance(userOrigin.lat, userOrigin.lng, ride.origin_lat, ride.origin_lng || 0),
      getDistance(userOrigin.lat, userOrigin.lng, ride.destination_lat, ride.destination_lng || 0)
    )
    if (userOriginToRideRoute < rideDistance * 0.3) {
      return { match: true, type: 'destination' }
    }
  }

  // Check if user's journey is roughly on the same route
  // User going in same direction but starting/ending at different points
  if (originToRideOrigin < THRESHOLD_KM * 3 && destToRideDest < THRESHOLD_KM * 3) {
    return { match: true, type: 'partial' }
  }

  return { match: false, type: 'none' }
}

interface RideCardProps {
  ride: RideWithDriver
  userOrigin: Location | null
  userDestination: Location | null
}

function RideCard({ ride, userOrigin, userDestination }: RideCardProps) {
  const routeMatch = isAlongTheWay(ride, userOrigin, userDestination)

  return (
    <Link to={`/rides/${ride.id}`}>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          {/* Route Match Badge */}
          {routeMatch.match && (
            <div className="mb-2">
              {routeMatch.type === 'exact' ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  <Route className="w-3 h-3" />
                  Perfect match
                </span>
              ) : routeMatch.type === 'origin' ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  <Route className="w-3 h-3" />
                  Same pickup, can drop you off along the way
                </span>
              ) : routeMatch.type === 'destination' ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                  <Route className="w-3 h-3" />
                  Can pick you up along the way
                </span>
              ) : routeMatch.type === 'partial' ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  <Route className="w-3 h-3" />
                  Similar route
                </span>
              ) : null}
            </div>
          )}

          <div className="flex justify-between items-start mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-navy-900" />
                <p className="font-medium text-sm truncate">{ride.origin_name}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-destructive" />
                <p className="font-medium text-sm truncate">{ride.destination_name}</p>
              </div>
            </div>
            <div className="text-right ml-4">
              <p className="font-bold text-coral-500">{formatCurrency(ride.price)}</p>
              <p className="text-xs text-muted-foreground">per seat</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4 text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatDate(ride.departure_time)}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {ride.available_seats} seats
              </span>
            </div>
          </div>

          {(ride.car_brand || ride.car_model) && (
            <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
              {ride.car_brand && ride.car_model ? (
                <p>{ride.car_brand} {ride.car_model} {ride.car_year && `(${ride.car_year})`}</p>
              ) : (
                <p>{ride.car_brand || ride.car_model}</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 pt-3 border-t">
            <div className="w-8 h-8 rounded-full bg-coral-100 flex items-center justify-center text-navy-800 text-xs font-medium">
              {ride.driver_name?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{ride.driver_name}</p>
            </div>
            {ride.driver_rating && (
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                <span className="text-sm">{ride.driver_rating.toFixed(1)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
