import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { rideRequestsRepository } from '@/shared/services/database'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { HomePageSEO } from '@/shared/components/SEO'
import { PageContainer } from '@/shared/components/PageContainer'
import { useMapShell } from '@/domains/core/rides/map/MapShellContext'
import { usePayments } from '@/shared/contexts/AppSettingsContext'
import { RideCard } from '@/domains/core/rides/components/RideCard'
import { TripSearchStack } from '@/domains/core/rides/components/TripSearchStack'
import { Calendar, Plus, ArrowRight, RefreshCw, Shield, Wallet, UserCheck, MessageSquare } from 'lucide-react'
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
  const { paymentsEnabled } = usePayments()
  const {
    rides,
    ridesLoading: loading,
    ridesError: error,
    refreshRides: fetchRides,
  } = shell
  const placingPin = shell.editing !== null
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
  // Open requests are only readable once signed in (migration 14), so a guest would
  // otherwise always see "0" here, which would misreport there being none at all.
  useEffect(() => {
    if (!user) {
      // Deferred (not called synchronously in the effect body) per the project's lint rule.
      const timer = setTimeout(() => setOpenRequestCount(null), 0)
      return () => clearTimeout(timer)
    }
    rideRequestsRepository
      .getOpenRideRequests()
      .then((requests) => setOpenRequestCount(requests.length))
      .catch(() => setOpenRequestCount(null))
  }, [user])

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
          <TripSearchStack />
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
                <p className="text-xs font-medium text-navy-900">{paymentsEnabled ? 'Secure Pay' : 'No fees'}</p>
                <p 
                  className={`text-xs ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                  style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                >
                  {paymentsEnabled ? 'Mobile Money' : 'Pay in cash'}
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
                      <p className="text-sm font-medium text-navy-900">{paymentsEnabled ? 'Book with 10% deposit' : 'Book your seat for free'}</p>
                      <p 
                        className={`text-xs ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                        style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                      >
                        {paymentsEnabled ? 'Pay via Mobile Money to secure your seat' : 'No booking fee — just tap Book'}
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
                      <p className="text-sm font-medium text-navy-900">{paymentsEnabled ? 'Travel and pay the rest' : 'Travel and pay the driver'}</p>
                      <p 
                        className={`text-xs ${!brandStyles.isCustom ? 'text-coral-500' : ''}`}
                        style={brandStyles.isCustom && brandColors ? { color: brandColors.accent } : undefined}
                      >
                        {paymentsEnabled ? 'Pay 90% in cash to your driver after the ride' : 'Pay the driver in cash after the ride'}
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
                  {paymentsEnabled
                    ? 'Book with 10% via Mobile Money, pay 90% cash to driver after the ride.'
                    : 'Booking is free. Pay the driver the ride price in cash after the ride.'}
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
