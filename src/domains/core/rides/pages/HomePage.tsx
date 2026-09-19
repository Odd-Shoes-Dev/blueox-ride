import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { rideRequestsRepository } from '@/shared/services/database'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { LocationPicker } from '@/domains/core/rides/components/LocationPicker'
import { HomePageSEO } from '@/shared/components/SEO'
import { PageContainer } from '@/shared/components/PageContainer'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import { useMapShell, type RideWithDriver } from '@/domains/core/rides/map/MapShellContext'
import { RoutePreviewChip } from '@/domains/core/rides/components/RoutePreviewChip'
import { Search, Calendar, Users, Star, Plus, ArrowRight, RefreshCw, Shield, Wallet, UserCheck, MessageSquare, Loader2, MapPin } from 'lucide-react'
import type { BrandColors } from '@/shared/types/branding'

// Semi-transparent white surface for controls floating over the map. Text on it is
// always navy (not theme-dependent) since what's behind it is the map, not the page.
// `pointer-events-auto` because the positioning wrappers around these are
// `pointer-events-none` — otherwise the empty space beside each control would swallow
// taps/drags meant for the map underneath.
const GLASS = 'bg-white/80 border border-white/50 shadow-lg pointer-events-auto'

interface HomePageProps {
  // Optional brand colors for church theming
  brandColors?: BrandColors
  churchName?: string
  // Optional church logo URL
  churchLogoUrl?: string
}

// The home screen. The map itself lives in the app's persistent MapShell behind
// this; this page is (1) a transparent, click-through window onto that map with
// the search card floating in it, then (2) the content that scrolls up over the map.
// Search state (trip, pins, results) is held by the shell so it survives opening
// and closing panels.
export default function HomePage({
  brandColors,
  churchName,
  churchLogoUrl,
}: HomePageProps = {}) {
  const { user } = useAuth()
  const shell = useMapShell()
  const {
    rides,
    ridesLoading: loading,
    ridesError: error,
    refreshRides: fetchRides,
    searching,
    origin: searchOrigin,
    destination: searchDestination,
    setOrigin: setSearchOrigin,
    setDestination: setSearchDestination,
    locatingUser,
    usingAutoPickup,
    setManualPickupOverride,
  } = shell
  const placingPin = shell.editing !== null
  const myNextRide = user ? shell.myRides[0] : undefined
  // A live trip bar sits at the top of the map, so the cards below it shift down to make room.
  const tripOffsetRem = shell.liveTrip ? 6.5 : 0
  const [openRequestCount, setOpenRequestCount] = useState<number | null>(null)

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

  // Show drivers a concrete demand signal ("N riders waiting") instead of a
  // generic "check for requests" link — value visible immediately, no click required.
  useEffect(() => {
    rideRequestsRepository
      .getOpenRideRequests()
      .then((requests) => setOpenRequestCount(requests.length))
      .catch(() => setOpenRequestCount(null))
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    shell.searchRides()
  }

  return (
    <>
      <HomePageSEO />

      {/* Window onto the map (full screen minus the 4rem bottom nav). Click-through
          so the map underneath stays draggable; only the cards in it take clicks. */}
      <div className="relative h-[calc(100dvh-4rem)]">
        {/* Church banner - its own floating pill, below the top row */}
        {churchName && (
          <div
            className="absolute inset-x-4 z-10 flex justify-center pointer-events-none"
            style={{ top: `${5 + tripOffsetRem}rem` }}
          >
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
            the map is fully visible. The fields' "select on map" buttons place
            their pin on the shared map themselves (see LocationPicker). */}
        <div
          className={`absolute inset-x-4 z-20 pointer-events-none ${placingPin ? 'hidden' : ''}`}
          style={{ top: `${(churchName ? 9 : 5) + tripOffsetRem}rem` }}
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
                    />
                    <LocationPicker
                      value={searchDestination}
                      onChange={setSearchDestination}
                      placeholder="Going to..."
                      markerColor="dropoff"
                      glass
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

            {/* A ride whose route the user chose to see stays on the map until cleared */}
            {shell.previewedRide && (
              <RoutePreviewChip
                className="mt-3"
                origin={shell.previewedRide.origin_name}
                destination={shell.previewedRide.destination_name}
                summary={shell.featured?.summary ?? null}
                loading={shell.featuredStatus === 'loading'}
                onClear={() => shell.previewRide(null)}
              />
            )}

            {/* The driver's own next ride (its route is drawn on the map) */}
            {myNextRide && !shell.previewedRide && (
              <Link
                to={`/rides/${myNextRide.id}`}
                className={`mt-3 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-navy-900 hover:bg-white/90 transition-colors ${GLASS}`}
              >
                <Star className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">
                  <strong>Your next ride</strong> · {myNextRide.origin_name} → {myNextRide.destination_name}
                </span>
                <span className="ml-auto pl-2 text-xs text-navy-900/70 whitespace-nowrap">{formatDate(myNextRide.departure_time)}</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Everything below scrolls up over the map */}
      <div className="bg-background pb-24 pointer-events-auto">
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
