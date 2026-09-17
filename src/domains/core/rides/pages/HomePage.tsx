import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ridesRepository, rideRequestsRepository, withTimeout, RequestTimeoutError } from '@/shared/services/database'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { LocationPicker } from '@/domains/core/rides/components/LocationPicker'
import { HomePageSEO } from '@/shared/components/SEO'
import { PageContainer } from '@/shared/components/PageContainer'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import { Search, Calendar, Users, Star, Plus, ArrowRight, RefreshCw, Shield, Wallet, UserCheck, MessageSquare } from 'lucide-react'
import type { BrandColors } from '@/shared/types/branding'

interface Location {
  lat: number
  lng: number
  name: string
}

type RideWithDriver = ridesRepository.RideWithDriverRow

interface HomePageProps {
  // Optional hero copy customization (for church landing pages)
  heroHeadline?: string
  heroSubtext?: string
  loggedInPrompt?: string
  // Optional brand colors for church theming
  brandColors?: BrandColors
  churchName?: string
  // Optional church logo URL
  churchLogoUrl?: string
}

export default function HomePage({
  heroHeadline = 'Travel together, pay less',
  heroSubtext = 'From your daily commute to trips upcountry — find trusted drivers going your way',
  loggedInPrompt = 'Where are you heading today?',
  brandColors,
  churchName,
  churchLogoUrl,
}: HomePageProps = {}) {
  const { user, profile } = useAuth()
  const [searchOrigin, setSearchOrigin] = useState<Location | null>(null)
  const [searchDestination, setSearchDestination] = useState<Location | null>(null)
  const [rides, setRides] = useState<RideWithDriver[]>([])
  const [openRequestCount, setOpenRequestCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasFetched = useRef(false)

  // Memoize dynamic styles based on brand colors
  const brandStyles = useMemo(() => {
    if (!brandColors) {
      return {
        heroGradient: 'bg-gradient-to-b from-navy-900 to-navy-800',
        accentBg: 'bg-coral-100',
        accentText: 'text-coral-500',
        accentBorder: 'border-coral-200',
        valuePropBg: 'bg-coral-50',
        stepBg: 'bg-coral-500',
        isCustom: false,
      }
    }
    return {
      heroGradient: '', // Will use inline style
      accentBg: '', // Will use inline style
      accentText: '', // Will use inline style
      accentBorder: '', // Will use inline style
      valuePropBg: '', // Will use inline style
      stepBg: '', // Will use inline style
      isCustom: true,
    }
  }, [brandColors])

  const fetchRides = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await withTimeout(ridesRepository.searchActiveRides({ limit: 20 }), 15000)
      setRides(data)
    } catch (err) {
      if (err instanceof RequestTimeoutError) {
        console.error('Request timed out')
        setError('Request timed out. Please check your connection.')
      } else {
        console.error('Fetch error:', err)
        setError('An error occurred. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Only fetch once on mount
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchRides()
    }
  }, [fetchRides])

  // Show drivers a concrete demand signal ("N riders waiting") instead of a
  // generic "check for requests" link — value visible immediately, no click required.
  useEffect(() => {
    rideRequestsRepository
      .getOpenRideRequests()
      .then((requests) => setOpenRequestCount(requests.length))
      .catch(() => setOpenRequestCount(null))
  }, [])

  const searchRides = async () => {
    // Prevent search if already searching
    if (searching) return

    setSearching(true)
    setLoading(true)
    setError(null)

    try {
      const data = await withTimeout(
        ridesRepository.searchActiveRides({
          originName: searchOrigin?.name,
          destinationName: searchDestination?.name,
          limit: 50,
        }),
        15000
      )
      setRides(data)
    } catch (err) {
      if (err instanceof RequestTimeoutError) {
        console.error('Search timed out')
        setError('Search timed out. Please try again.')
      } else {
        console.error('Search error:', err)
        setError('An error occurred. Please try again.')
      }
    } finally {
      setLoading(false)
      setSearching(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    searchRides()
  }

  return (
    <>
      <HomePageSEO />
      <div className="min-h-screen bg-background pb-24">
        {/* Hero Section */}
      <div 
        className={`pt-8 pb-10 px-4 ${!brandStyles.isCustom ? brandStyles.heroGradient : ''}`}
        style={brandStyles.isCustom && brandColors ? {
          background: `linear-gradient(to bottom, ${brandColors.primary}, ${brandColors.primaryDark})`,
        } : undefined}
      >
        <PageContainer>
          {/* Header with Logo */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <img
                src="/assets/logo1.png"
                alt="Blue OX Rides"
                className="w-12 h-12 object-contain"
              />
              <div className="flex flex-col">
                <span className="text-white font-bold text-lg">Blue OX Rides</span>
                {churchName && (
                  <span 
                    className="text-xs font-medium"
                    style={{ color: brandColors?.heroSubtext || '#ffe0e0' }}
                  >
                    for {churchName}
                  </span>
                )}
              </div>
            </div>
            {user ? (
              <Link to="/profile">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-semibold">
                  {profile?.full_name?.[0]?.toUpperCase() || '?'}
                </div>
              </Link>
            ) : (
              <Link to="/login">
                <div className="px-4 py-2 rounded-full bg-white/20 text-white text-sm font-medium hover:bg-white/30 transition-colors">
                  Sign In
                </div>
              </Link>
            )}
          </div>

          {/* Church Logo Banner - shown for church landing pages */}
          {churchName && (
            <div className="flex items-center justify-center mb-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-3">
                {churchLogoUrl ? (
                  <img
                    src={churchLogoUrl}
                    alt={`${churchName} logo`}
                    className="h-10 w-auto max-w-[140px] object-contain"
                    onError={(e) => {
                      // Hide the image if it fails to load
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <div 
                    className="text-sm font-semibold"
                    style={{ color: brandColors?.accent || '#F5A623' }}
                  >
                    {churchName}
                  </div>
                )}
                <div className="h-6 w-px bg-white/30" />
                <span 
                  className="text-xs"
                  style={{ color: brandColors?.heroSubtext || '#ffe0e0' }}
                >
                  Official Partner
                </span>
              </div>
            </div>
          )}

          {/* Hero Message */}
          <div className="text-center mb-6">
            {user ? (
              <div>
                <p 
                  className="text-sm mb-1"
                  style={{ color: brandColors?.heroSubtext || '#ffe0e0' }}
                >
                  Welcome back,
                </p>
                <h1 
                  className="text-2xl font-bold"
                  style={{ color: brandColors?.heroText || '#ffffff' }}
                >
                  {profile?.full_name?.split(' ')[0] || 'Traveler'}
                </h1>
                <p 
                  className="mt-2"
                  style={{ color: brandColors?.heroSubtext || '#ffe0e0' }}
                >
                  {loggedInPrompt}
                </p>
              </div>
            ) : (
              <div>
                <h1 
                  className="text-2xl font-bold mb-2"
                  style={{ color: brandColors?.heroText || '#ffffff' }}
                >
                  {heroHeadline}
                </h1>
                <p 
                  className="text-base"
                  style={{ color: brandColors?.heroSubtext || '#ffe0e0' }}
                >
                  {heroSubtext}
                </p>
              </div>
            )}
          </div>

          {/* Search Box */}
          <Card className="shadow-lg">
            <CardContent className="p-4">
              <form onSubmit={handleSearch} className="space-y-3">
                <LocationPicker
                  value={searchOrigin}
                  onChange={setSearchOrigin}
                  placeholder="Leaving from..."
                  markerColor="pickup"
                />
                <LocationPicker
                  value={searchDestination}
                  onChange={setSearchDestination}
                  placeholder="Going to..."
                  markerColor="dropoff"
                />
                <Button type="submit" className="w-full" size="lg" disabled={searching}>
                  {searching ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Find a Ride
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </PageContainer>
      </div>

      {/* Value Props - Only show to non-logged in users */}
      {!user && (
        <div 
          className={`px-4 py-6 border-b ${!brandStyles.isCustom ? 'bg-coral-50' : ''}`}
          style={brandStyles.isCustom && brandColors ? {
            backgroundColor: brandColors.accentLight,
          } : undefined}
        >
          <PageContainer>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 ${!brandStyles.isCustom ? 'bg-coral-100' : ''}`}
                  style={brandStyles.isCustom && brandColors ? {
                    backgroundColor: `${brandColors.accent}20`,
                  } : undefined}
                >
                  <Wallet 
                    className={`w-5 h-5 ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                    style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                  />
                </div>
                <p className="text-xs font-medium text-navy-900">Save Money</p>
                <p 
                  className={`text-xs ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                  style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                >
                  Split travel costs
                </p>
              </div>
              <div>
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 ${!brandStyles.isCustom ? 'bg-coral-100' : ''}`}
                  style={brandStyles.isCustom && brandColors ? {
                    backgroundColor: `${brandColors.accent}20`,
                  } : undefined}
                >
                  <UserCheck 
                    className={`w-5 h-5 ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                    style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                  />
                </div>
                <p className="text-xs font-medium text-navy-900">Verified Users</p>
                <p 
                  className={`text-xs ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                  style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                >
                  Trusted community
                </p>
              </div>
              <div>
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2 ${!brandStyles.isCustom ? 'bg-coral-100' : ''}`}
                  style={brandStyles.isCustom && brandColors ? {
                    backgroundColor: `${brandColors.accent}20`,
                  } : undefined}
                >
                  <Shield 
                    className={`w-5 h-5 ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                    style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                  />
                </div>
                <p className="text-xs font-medium text-navy-900">Secure Pay</p>
                <p 
                  className={`text-xs ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                  style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                >
                  Mobile Money
                </p>
              </div>
            </div>
          </PageContainer>
        </div>
      )}

      {/* Quick Actions */}
      <div className={`px-4 ${user ? '-mt-4' : 'mt-4'}`}>
        <PageContainer>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link to={user ? '/rides/create' : '/login'} state={!user ? { from: '/rides/create' } : undefined}>
              <Card 
                className={`hover:shadow-md transition-shadow border-2 border-transparent ${!brandStyles.isCustom ? 'hover:border-coral-200' : ''}`}
                style={brandStyles.isCustom && brandColors ? {
                  '--hover-border-color': `${brandColors.accent}40`,
                } as React.CSSProperties : undefined}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div 
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${!brandStyles.isCustom ? 'bg-coral-100' : ''}`}
                    style={brandStyles.isCustom && brandColors ? {
                      backgroundColor: `${brandColors.accent}20`,
                    } : undefined}
                  >
                    <Plus 
                      className={`w-5 h-5 ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                      style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Offer a Ride</p>
                    <p className="text-xs text-muted-foreground">Earn by sharing your trip</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link to={user ? '/my-rides' : '/login'} state={!user ? { from: '/my-rides' } : undefined}>
              <Card
                className={`hover:shadow-md transition-shadow border-2 border-transparent ${!brandStyles.isCustom ? 'hover:border-coral-200' : ''}`}
                style={brandStyles.isCustom && brandColors ? {
                  '--hover-border-color': `${brandColors.accent}40`,
                } as React.CSSProperties : undefined}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${!brandStyles.isCustom ? 'bg-coral-100' : ''}`}
                    style={brandStyles.isCustom && brandColors ? {
                      backgroundColor: `${brandColors.accent}20`,
                    } : undefined}
                  >
                    <Calendar
                      className={`w-5 h-5 ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                      style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-sm">My Rides</p>
                    <p className="text-xs text-muted-foreground">View your bookings</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link to="/requests">
              <Card
                className={`hover:shadow-md transition-shadow border-2 border-transparent ${!brandStyles.isCustom ? 'hover:border-coral-200' : ''}`}
                style={brandStyles.isCustom && brandColors ? {
                  '--hover-border-color': `${brandColors.accent}40`,
                } as React.CSSProperties : undefined}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${!brandStyles.isCustom ? 'bg-coral-100' : ''}`}
                    style={brandStyles.isCustom && brandColors ? {
                      backgroundColor: `${brandColors.accent}20`,
                    } : undefined}
                  >
                    <MessageSquare
                      className={`w-5 h-5 ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                      style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Ride Requests</p>
                    <p className="text-xs text-muted-foreground">
                      {openRequestCount === null
                        ? 'People near your route need rides'
                        : openRequestCount === 0
                        ? 'No open requests right now'
                        : `${openRequestCount} rider${openRequestCount !== 1 ? 's' : ''} waiting for a driver`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </PageContainer>
      </div>

      {/* Available Rides */}
      <div className="px-4 mt-6">
        <PageContainer size="wide">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Available Rides</h2>
            <Link to="/search" className="text-sm text-primary flex items-center">
              View all <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="skeleton h-20 rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-destructive mb-4">{error}</p>
                <Button onClick={fetchRides} variant="outline">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
              </CardContent>
            </Card>
          ) : rides.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">No rides available</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Check back later or offer your own ride
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {rides.map((ride) => (
                <RideCard key={ride.id} ride={ride} />
              ))}
            </div>
          )}
        </PageContainer>
      </div>

      {/* How It Works - Only show to non-logged in users */}
      {!user && (
        <div className="px-4 mt-6">
          <PageContainer>
            <Card
              className={!brandStyles.isCustom ? 'bg-coral-50 border-coral-200' : ''}
              style={brandStyles.isCustom && brandColors ? {
                backgroundColor: brandColors.accentLight,
                borderColor: `${brandColors.accent}40`,
              } : undefined}
            >
              <CardContent className="p-4">
                <h3 className="font-semibold text-navy-900 mb-3">How it works</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div 
                      className={`w-6 h-6 rounded-full text-white flex items-center justify-center text-xs font-bold flex-shrink-0 ${!brandStyles.isCustom ? 'bg-coral-500' : ''}`}
                      style={brandStyles.isCustom && brandColors ? { backgroundColor: brandColors.accent } : undefined}
                    >
                      1
                    </div>
                    <div>
                      <p className="text-sm font-medium text-navy-900">Find your ride</p>
                      <p 
                        className={`text-xs ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                        style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                      >
                        Search for drivers going your way
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div 
                      className={`w-6 h-6 rounded-full text-white flex items-center justify-center text-xs font-bold flex-shrink-0 ${!brandStyles.isCustom ? 'bg-coral-500' : ''}`}
                      style={brandStyles.isCustom && brandColors ? { backgroundColor: brandColors.accent } : undefined}
                    >
                      2
                    </div>
                    <div>
                      <p className="text-sm font-medium text-navy-900">Book with 10% deposit</p>
                      <p 
                        className={`text-xs ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                        style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                      >
                        Pay via Mobile Money to secure your seat
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div 
                      className={`w-6 h-6 rounded-full text-white flex items-center justify-center text-xs font-bold flex-shrink-0 ${!brandStyles.isCustom ? 'bg-coral-500' : ''}`}
                      style={brandStyles.isCustom && brandColors ? { backgroundColor: brandColors.accent } : undefined}
                    >
                      3
                    </div>
                    <div>
                      <p className="text-sm font-medium text-navy-900">Travel and pay the rest</p>
                      <p 
                        className={`text-xs ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                        style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                      >
                        Pay 90% in cash to your driver after the ride
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </PageContainer>
        </div>
      )}

      {/* Payment Info - For logged in users */}
      {user && (
        <div className="px-4 mt-6">
          <PageContainer>
            <Card
              className={!brandStyles.isCustom ? 'bg-coral-50 border-coral-200' : ''}
              style={brandStyles.isCustom && brandColors ? {
                backgroundColor: brandColors.accentLight,
                borderColor: `${brandColors.accent}40`,
              } : undefined}
            >
              <CardContent className="p-4">
                <h3 className="font-medium text-navy-900 mb-2">Payment reminder</h3>
                <p className="text-sm text-navy-800">
                  Book with 10% via Mobile Money, pay 90% cash to driver after the ride.
                </p>
              </CardContent>
            </Card>
          </PageContainer>
        </div>
      )}
      </div>
    </>
  )
}

function RideCard({ ride }: { ride: RideWithDriver }) {
  return (
    <Link to={`/rides/${ride.id}`}>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          {/* Car Photo Banner */}
          {ride.car_photo_url && (
            <div className="aspect-[3/1] rounded-lg overflow-hidden bg-muted mb-3 -mx-1 -mt-1">
              <img
                src={ride.car_photo_url}
                alt="Driver's car"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex justify-between items-start mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-coral-500" />
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
