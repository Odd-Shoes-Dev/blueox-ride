import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ridesRepository, rideRequestsRepository, withTimeout, RequestTimeoutError } from '@/shared/services/database'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { LocationPicker } from '@/domains/core/rides/components/LocationPicker'
import { HeroLiveMap } from '@/domains/core/rides/components/HeroLiveMap'
import { MapPlaceSearch } from '@/domains/core/rides/components/MapPlaceSearch'
import type { PinKind } from '@/domains/core/rides/components/mapPins'
import { HomePageSEO } from '@/shared/components/SEO'
import { PageContainer } from '@/shared/components/PageContainer'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import { reverseGeocode } from '@/shared/services/geocoding'
import { Search, Calendar, Users, Star, Plus, ArrowRight, RefreshCw, Shield, Wallet, UserCheck, MessageSquare, Loader2, MapPin, ChevronDown } from 'lucide-react'
import type { BrandColors } from '@/shared/types/branding'

// Semi-transparent white surface for controls floating over the hero map. Text on it is
// always navy (not theme-dependent) since what's behind it is the map, not the page.
// `pointer-events-auto` because the full-width positioning wrappers around these are
// `pointer-events-none` — otherwise the empty space beside each control would swallow
// taps/drags meant for the map underneath.
const GLASS = 'bg-white/80 border border-white/50 shadow-lg pointer-events-auto'

interface Location {
  lat: number
  lng: number
  name: string
}

type RideWithDriver = ridesRepository.RideWithDriverRow

interface HomePageProps {
  // Optional brand colors for church theming
  brandColors?: BrandColors
  churchName?: string
  // Optional church logo URL
  churchLogoUrl?: string
}

export default function HomePage({
  brandColors,
  churchName,
  churchLogoUrl,
}: HomePageProps = {}) {
  const { user, profile } = useAuth()
  const [searchOrigin, setSearchOrigin] = useState<Location | null>(null)
  const [searchDestination, setSearchDestination] = useState<Location | null>(null)
  const [locatingUser, setLocatingUser] = useState(true)
  const [geoFailed, setGeoFailed] = useState(false)
  const [manualPickupOverride, setManualPickupOverride] = useState(false)
  // Which pin the user is currently placing on the hero map (null = none).
  const [editingPin, setEditingPin] = useState<PinKind | null>(null)
  // Place search (top-right): just moves the map, never touches the trip fields.
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false)
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number } | null>(null)
  // Latest map centre, used to rank place-search results near what's on screen.
  // A ref (not state) — it changes on every pan and nothing needs to re-render.
  const mapCenterRef = useRef<{ lat: number; lng: number } | null>(null)
  const [rides, setRides] = useState<RideWithDriver[]>([])
  const [openRequestCount, setOpenRequestCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasFetched = useRef(false)
  const heroRef = useRef<HTMLDivElement>(null)

  const scrollPastHero = () => {
    const hero = heroRef.current
    if (!hero) return
    window.scrollTo({ top: hero.offsetTop + hero.offsetHeight, behavior: 'smooth' })
  }

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

  // Auto-detected pickup is a full reverse-geocoded address (e.g. "Kampala
  // Road, Kampala"), which rarely appears verbatim in a driver-typed
  // origin_name — filtering on it would silently return nothing. Only use
  // the origin as a text filter once the user (or the geo-fallback form)
  // explicitly picked it themselves.
  const usingAutoPickup = !geoFailed && !manualPickupOverride

  const searchRides = async () => {
    // Prevent search if already searching
    if (searching) return

    setSearching(true)
    setLoading(true)
    setError(null)

    try {
      const data = await withTimeout(
        ridesRepository.searchActiveRides({
          originName: usingAutoPickup ? undefined : searchOrigin?.name,
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

  const handleHeroLocationFound = (coords: { lat: number; lng: number }) => {
    reverseGeocode(coords.lat, coords.lng)
      .then((name) => setSearchOrigin({ ...coords, name }))
      .catch(() => setSearchOrigin({ ...coords, name: 'Current location' }))
      .finally(() => setLocatingUser(false))
  }

  const handleHeroLocationUnavailable = () => {
    setGeoFailed(true)
    setLocatingUser(false)
  }

  const handlePlaceSelect = (place: { lat: number; lng: number }) => {
    setMapFocus({ lat: place.lat, lng: place.lng })
    setPlaceSearchOpen(false)
  }

  const handlePinConfirm = (kind: PinKind, point: Location) => {
    if (kind === 'pickup') setSearchOrigin(point)
    else setSearchDestination(point)
    setEditingPin(null)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    searchRides()
  }

  return (
    <>
      <HomePageSEO />
      <div className="min-h-screen bg-background pb-24">
        {/* Hero Section — full-bleed live map with semi-transparent white
            floating controls (fixed dark text, so they stay readable over
            any map colour in either theme). No headline here by design —
            just map + search. */}
      {/* Full viewport height (dvh so mobile browser chrome doesn't push the
          bottom edge off-screen). Everyone has the fixed bottom nav (h-16), so
          subtract it to keep the map's bottom edge and attribution visible. */}
      <div
        ref={heroRef}
        className="relative overflow-hidden h-[calc(100dvh-4rem)] min-h-[520px]"
      >
        <HeroLiveMap
          rides={rides}
          className="absolute inset-0"
          onLocationFound={handleHeroLocationFound}
          onLocationUnavailable={handleHeroLocationUnavailable}
          // In auto-pickup mode the start is the user's own dot, not a pin.
          origin={usingAutoPickup ? null : searchOrigin}
          destination={searchDestination}
          editing={editingPin}
          focus={mapFocus}
          onViewChange={(center) => {
            mapCenterRef.current = center
          }}
          onEditConfirm={handlePinConfirm}
          onEditCancel={() => setEditingPin(null)}
        />

        {/* Top row: logo pill (left) + sign-in/avatar pill (right) */}
        {/* z-30 (above the search card's z-20) so the place-search suggestions can overlap it. */}
        <div className="absolute top-4 inset-x-4 z-30 flex items-center justify-between pointer-events-none">
          <Link
            to="/"
            aria-label="Blue OX Rides home"
            className={`flex items-center gap-2 rounded-full pl-2 pr-4 py-2 hover:bg-white/90 transition-colors ${GLASS} ${placeSearchOpen ? 'max-sm:hidden' : ''}`}
          >
            <img
              src="/assets/logo1.png"
              alt=""
              className="w-7 h-7 object-contain"
            />
            <span className="font-bold text-navy-900 text-sm">Blue OX Rides</span>
          </Link>
          {/* Right cluster. Search is a place finder for the map only: it expands
              into a field, and picking a result just moves the map there. On
              phones the open field takes the whole row (logo/sign-in hide). */}
          <div className={`flex items-center gap-2 ${placeSearchOpen ? 'flex-1 justify-end' : ''}`}>
            {placeSearchOpen ? (
              <MapPlaceSearch
                onSelect={handlePlaceSelect}
                onClose={() => setPlaceSearchOpen(false)}
                getNearby={() => mapCenterRef.current}
              />
            ) : (
              <button
                type="button"
                onClick={() => setPlaceSearchOpen(true)}
                aria-label="Search places on the map"
                className={`w-10 h-10 rounded-full flex items-center justify-center text-navy-900 hover:bg-white/90 transition-colors ${GLASS}`}
              >
                <Search className="w-5 h-5" />
              </button>
            )}
            <div className={`flex-shrink-0 whitespace-nowrap ${placeSearchOpen ? 'max-sm:hidden' : ''}`}>
              {user ? (
                <Link to="/profile">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-navy-900 font-semibold ${GLASS}`}>
                    {profile?.full_name?.[0]?.toUpperCase() || '?'}
                  </div>
                </Link>
              ) : (
                <Link to="/login">
                  <div className={`px-4 py-2.5 rounded-full text-navy-900 text-sm font-medium hover:bg-white/80 transition-colors ${GLASS}`}>
                    Sign In
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Church banner - its own floating pill, below the top row */}
        {churchName && (
          <div className="absolute top-20 inset-x-4 z-10 flex justify-center pointer-events-none">
            <div className={`inline-flex items-center gap-3 rounded-xl px-4 py-2 text-navy-900 ${GLASS}`}>
              {churchLogoUrl ? (
                <img
                  src={churchLogoUrl}
                  alt={`${churchName} logo`}
                  className="h-8 w-auto max-w-[120px] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <div className="text-sm font-semibold" style={{ color: brandColors?.accent || '#F5A623' }}>
                  {churchName}
                </div>
              )}
              <div className="h-5 w-px bg-navy-900/20" />
              <span className="text-xs text-navy-900/70">Official Partner</span>
            </div>
          </div>
        )}

        {/* Search widget — floating card directly on the map. Hidden (not
            unmounted, so typed text survives) while a pin is being placed, so
            the map is fully visible. */}
        <div
          className={`absolute inset-x-4 z-20 pointer-events-none ${churchName ? 'top-36' : 'top-20'} ${editingPin ? 'hidden' : ''}`}
        >
          <div className="max-w-md mx-auto">
            <Card className={`shadow-xl text-navy-900 ${GLASS}`}>
              <CardContent className="p-4">
                {locatingUser ? (
                  <div className="flex items-center gap-2 text-navy-900/70 py-2 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Finding your location...
                  </div>
                ) : usingAutoPickup && searchOrigin ? (
                  <form onSubmit={handleSearch} className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-navy-900/70 px-1">
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 flex-shrink-0 text-green-600" />
                        <span className="truncate">From {searchOrigin.name}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setManualPickupOverride(true)}
                        className="text-navy-900 font-medium underline flex-shrink-0 ml-2"
                      >
                        Change
                      </button>
                    </div>
                    <LocationPicker
                      value={searchDestination}
                      onChange={setSearchDestination}
                      placeholder="Where are you going?"
                      markerColor="dropoff"
                      glass
                      onPickOnMap={() => setEditingPin('dropoff')}
                    />
                    <Button type="submit" className="w-full" size="lg" disabled={searching || !searchDestination}>
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
                ) : (
                  <form onSubmit={handleSearch} className="space-y-3">
                    <LocationPicker
                      value={searchOrigin}
                      onChange={setSearchOrigin}
                      placeholder="Leaving from..."
                      markerColor="pickup"
                      glass
                      onPickOnMap={() => setEditingPin('pickup')}
                    />
                    <LocationPicker
                      value={searchDestination}
                      onChange={setSearchDestination}
                      placeholder="Going to..."
                      markerColor="dropoff"
                      glass
                      onPickOnMap={() => setEditingPin('dropoff')}
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
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Scroll-down FAB — the map fills the screen and captures drag/wheel
            gestures, so the page itself can't be scrolled from here. Sits above
            the map's attribution in the bottom-right corner. */}
        {!editingPin && (
          <button
            type="button"
            onClick={scrollPastHero}
            aria-label="Scroll to more"
            className={`absolute bottom-8 right-4 z-20 w-12 h-12 rounded-full flex items-center justify-center text-navy-900 hover:bg-white/90 transition-colors ${GLASS}`}
          >
            <ChevronDown className="w-6 h-6" />
          </button>
        )}
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
      {/* Positive margin for signed-in users too: this used to be -mt-4 so the cards
          overlapped the old gradient hero, but the hero is now a full-screen map
          (positioned, so it paints over non-positioned siblings) and that overlap
          hid the top of the cards behind it. */}
      <div className={`px-4 ${user ? 'mt-6' : 'mt-4'}`}>
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

      {/* Legal links */}
      <footer className="px-4 mt-10 pb-2 text-center text-xs text-muted-foreground">
        <Link to="/terms" className="hover:text-foreground hover:underline">Terms of Use</Link>
        {' · '}
        <Link to="/privacy" className="hover:text-foreground hover:underline">Privacy Policy</Link>
      </footer>
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
