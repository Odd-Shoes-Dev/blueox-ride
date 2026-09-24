import { useEffect, useState } from 'react'
import { Link, Outlet, matchPath, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Menu, Search } from 'lucide-react'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { HeroLiveMap } from '@/domains/core/rides/components/HeroLiveMap'
import { MapPlaceSearch } from '@/domains/core/rides/components/MapPlaceSearch'
import { MapShellProvider } from '@/domains/core/rides/map/MapShellProvider'
import { useMapShell } from '@/domains/core/rides/map/MapShellContext'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar'
import { cn } from '@/shared/lib/utils'
import { RoutePreviewChip } from '@/domains/core/rides/components/RoutePreviewChip'
import { TripBar } from '@/domains/core/rides/components/TripBar'
import { TripSearchStack } from '@/domains/core/rides/components/TripSearchStack'
import { MapPanel, type SheetSnap } from '@/app/MapPanel'

// Semi-transparent white surface for controls floating over the map. Text on it
// is always navy (not theme-dependent) since what's behind it is the map.
// `pointer-events-auto` because the positioning rows around these are
// click-through, so empty space never blocks the map.
const GLASS = 'bg-white/80 border border-white/50 shadow-lg pointer-events-auto'

interface MapShellProps {
  // Routes that open as a panel over the map, and the name shown on the button
  // that reopens each one. Every other route rendered inside the shell is the
  // home screen (landing page, church pages).
  panels: { path: string; title: string }[]
}

// Layout route for the whole app experience: ONE map that stays mounted, with
// each screen shown on top of it — the home screen scrolls over the map, and
// everything else opens as a side panel (desktop) or bottom sheet (phones).
// Because the map never unmounts, moving between screens doesn't reload it or
// ask for the user's location again.
export function MapShell({ panels }: MapShellProps) {
  return (
    <MapShellProvider>
      <MapShellLayout panels={panels} />
    </MapShellProvider>
  )
}

function MapShellLayout({ panels }: MapShellProps) {
  const { pathname, key: locationKey } = useLocation()
  const shell = useMapShell()
  const { user, profile } = useAuth()
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false)

  const panel = panels.find((candidate) => matchPath({ path: candidate.path, end: true }, pathname))
  const isPanel = panel !== undefined
  const placingPin = shell.editing !== null

  // Larger screens: hiding the side panel keeps it mounted (forms, scroll position and all)
  // and leaves the URL alone; the edge tab (or the pill by the logo) brings it straight back.
  // Tied to this particular visit (location.key), so opening the same screen again later
  // starts with it showing.
  const [collapsedFor, setCollapsedFor] = useState<string | null>(null)
  const collapsed = isPanel && collapsedFor === locationKey
  const panelOpen = isPanel && !collapsed

  // Phones: the bottom sheet is pulled between a peek, half and full height instead of
  // hidden. Also per visit, so a new screen opens at half. The map needs the height
  // to know how much of the screen it gets.
  const [sheet, setSheet] = useState<{ key: string; snap: SheetSnap }>({ key: '', snap: 'half' })
  const sheetSnap: SheetSnap = sheet.key === locationKey ? sheet.snap : 'half'

  // Minimising the panel (hidden on larger screens, peek on phones) is how you get back to
  // searching: the map shows the same search card as the home screen, and expanding the
  // panel returns to the screen you left, unchanged. Hiding is desktop-only and peek is
  // phone-only, so each half of the condition only applies at its own screen size.
  // Never during a live trip, though — searching for a different ride doesn't make sense while
  // one is already running (driving it, or following it as a passenger), and it was clashing
  // with the trip bar for the same small strip of screen on a phone.
  const peeking = sheetSnap === 'peek'
  const showSearchCard = isPanel && (collapsed || peeking) && !shell.liveTrip
  const searchCardScreens = collapsed && peeking ? '' : collapsed ? 'max-md:hidden' : 'md:hidden'
  const routeChipHiddenOn = collapsed && peeking ? 'hidden' : collapsed ? 'md:hidden' : peeking ? 'max-md:hidden' : ''

  // A new screen always starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  // Where the map is drawn. Home: the whole screen above the bottom nav. With a
  // panel open: right of the side panel (desktop) or above the sheet (phones — 4rem is
  // the bottom nav, 3.5rem the sheet's peek bar; half height leaves 45% of the screen).
  // While placing a pin on a phone the sheet hides, so the map takes the full height.
  const sheetMapHeight = sheetSnap === 'peek' ? 'h-[calc(100dvh-7.5rem)]' : 'h-[calc(45dvh-4rem)]'
  const mapFrame = cn(
    'fixed top-0 right-0 left-0 md:h-[calc(100dvh-4rem)]',
    panelOpen && 'md:left-[420px]',
    isPanel && !placingPin ? sheetMapHeight : 'h-[calc(100dvh-4rem)]'
  )

  // Pins on the map: the trip the user searched for (pickup, destination, and the dashed line
  // between them) stays on the map on EVERY screen — browsing results, opening a ride, and so on.
  // A panel that plans its own trip (Offer a Ride, Request a Ride, Search) shows its own pins instead.
  const tripPins = { origin: shell.usingAutoPickup ? null : shell.origin, destination: shell.destination }
  const pins = isPanel ? (shell.panelPins ?? tripPins) : tripPins

  const initials = (profile?.full_name || user?.email || '?')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2)

  // On the results screen, the map shows the found rides (not the general list) and
  // frames them together with the trip's ends.
  const showingResults = pathname === '/results' && shell.results !== null
  const resultPoints: [number, number][] = showingResults
    ? [
        ...shell.results!.rides.map((ride): [number, number] => [ride.origin_lat, ride.origin_lng]),
        ...(shell.results!.origin ? [[shell.results!.origin.lat, shell.results!.origin.lng] as [number, number]] : []),
        ...(shell.results!.destination
          ? [[shell.results!.destination.lat, shell.results!.destination.lng] as [number, number]]
          : []),
      ]
    : []

  const scrollPastMap = () => {
    // The map fills the screen minus the 4rem bottom nav.
    window.scrollTo({ top: window.innerHeight - 64, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      <HeroLiveMap
        rides={showingResults ? shell.results!.rides : shell.rides}
        fitPoints={showingResults ? { points: resultPoints, token: shell.results!.token } : null}
        className={mapFrame}
        onLocationFound={shell.handleLocationFound}
        onLocationUnavailable={shell.handleLocationUnavailable}
        origin={pins?.origin ?? null}
        destination={pins?.destination ?? null}
        myRides={shell.myRides}
        requests={shell.requestPins ?? []}
        onSelectRequest={shell.selectRequest}
        featured={isPanel && shell.featured?.isDefault ? null : shell.featured}
        onSelectRide={shell.selectRide}
        onDeselectRide={shell.deselectRide}
        driver={shell.livePosition}
        driverZoom={shell.liveTrip?.role === 'driver' ? 17 : undefined}
        hideUserLocation={shell.liveTrip?.role === 'driver'}
        editing={shell.editing}
        focus={shell.focus}
        onViewChange={shell.reportMapCenter}
        onEditConfirm={(_kind, point) => shell.finishPin(point)}
        onEditCancel={() => shell.finishPin(null)}
      />

      {/* Corner controls — logo (home), place search, account. They sit in the
          page flow (absolute, not fixed), so on the home screen they scroll away
          with the map and on panel screens they stay put. z-[45]: above the panel
          and the search card, below the bottom nav. */}
      <div
        className={cn(
          'absolute z-[45] flex items-center justify-between pointer-events-none',
          isPanel ? 'top-2 inset-x-3' : 'top-4 inset-x-4'
        )}
      >
        <div className="flex items-center gap-2">
        <Link
          to="/"
          aria-label="Blue OX Rides home"
          className={cn(
            'flex items-center rounded-full hover:bg-white/90 transition-colors',
            GLASS,
            isPanel ? 'w-9 h-9 justify-center' : 'gap-2 pl-2 pr-4 py-2',
            placeSearchOpen && 'max-sm:hidden'
          )}
        >
          <img src="/assets/logo1.png" alt="" className={isPanel ? 'w-6 h-6 object-contain' : 'w-7 h-7 object-contain'} />
          {!isPanel && <span className="font-bold text-navy-900 text-sm">Blue OX Rides</span>}
        </Link>

        {/* Larger screens: brings back a hidden panel exactly as it was left (phones
            pull the sheet up from its peek bar instead) */}
        {collapsed && (
          <button
            type="button"
            onClick={() => setCollapsedFor(null)}
            aria-label={`Show ${panel?.title ?? 'panel'}`}
            className={cn(
              'max-md:hidden flex items-center gap-2 rounded-full h-9 pl-3 pr-4 text-sm font-medium text-navy-900 hover:bg-white/90 transition-colors',
              GLASS
            )}
          >
            <Menu className="w-4 h-4" />
            <span className="truncate max-w-[9rem]">{panel?.title}</span>
          </button>
        )}
        </div>

        {/* Right cluster. Search is a place finder for the map only: it expands
            into a field, and picking a result just moves the map there. On
            phones the open field takes the whole row (logo/sign-in hide). */}
        <div className={cn('flex items-center gap-2', placeSearchOpen && 'flex-1 justify-end')}>
          {placeSearchOpen ? (
            <MapPlaceSearch
              onSelect={(place) => {
                shell.focusOn(place.lat, place.lng)
                setPlaceSearchOpen(false)
              }}
              onClose={() => setPlaceSearchOpen(false)}
              getNearby={shell.getMapCenter}
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaceSearchOpen(true)}
              aria-label="Search places on the map"
              className={cn(
                'rounded-full flex items-center justify-center text-navy-900 hover:bg-white/90 transition-colors',
                GLASS,
                isPanel ? 'w-9 h-9' : 'w-10 h-10'
              )}
            >
              <Search className="w-5 h-5" />
            </button>
          )}
          <div className={cn('flex-shrink-0 whitespace-nowrap', placeSearchOpen && 'max-sm:hidden')}>
            {user ? (
              <Link to="/profile" aria-label="Your profile" className="block rounded-full shadow-lg pointer-events-auto">
                <Avatar className={cn('border border-white/50', isPanel ? 'w-9 h-9' : 'w-10 h-10')}>
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-white text-navy-900 text-sm font-semibold">{initials}</AvatarFallback>
                </Avatar>
              </Link>
            ) : (
              <Link
                to="/login"
                className={cn(
                  'flex items-center rounded-full px-4 text-navy-900 text-sm font-medium hover:bg-white/90 transition-colors',
                  GLASS,
                  isPanel ? 'h-9' : 'h-10'
                )}
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Live trip status. Always at the top of the visible map, whichever screen is open. */}
      {shell.liveTrip && !placingPin && (
        <div
          className={cn(
            'fixed top-14 right-0 left-0 z-[44] flex justify-center px-3 pointer-events-none',
            panelOpen && 'md:left-[420px]'
          )}
        >
          <TripBar
            trip={shell.liveTrip}
            position={shell.livePosition}
            route={shell.tripRoute}
            error={shell.liveError}
            seats={shell.tripSeats}
            onAdjustSeats={shell.adjustTripSeats}
            onStop={shell.stopLiveTrip}
          />
        </div>
      )}

      {/* On panel screens the previewed route's chip sits at the top of the visible map.
          (On the home screen it's part of the search card's stack instead.) Hidden for the
          whole duration of a live trip — not just when it happens to match — since the trip
          bar already owns "which route you're on" while one is running. */}
      {isPanel && shell.previewedRide && !placingPin && !shell.liveTrip && (
        <div
          className={cn(
            'fixed top-36 right-0 left-0 z-[43] flex justify-center px-3 pointer-events-none',
            panelOpen && 'md:left-[420px]',
            routeChipHiddenOn // the search card below carries its own chip
          )}
        >
          <RoutePreviewChip
            origin={shell.previewedRide.origin_name}
            destination={shell.previewedRide.destination_name}
            summary={shell.featured?.summary ?? null}
            loading={shell.featuredStatus === 'loading'}
            onClear={() => shell.previewRide(null)}
          />
        </div>
      )}

      {/* The search card, when the panel is out of the way. Same card as the home screen;
          hidden (not unmounted, so a pin being placed from it still lands) while placing. */}
      {showSearchCard && (
        <div
          className={cn('fixed inset-x-4 z-[42] pointer-events-none', searchCardScreens, placingPin && 'hidden')}
          style={{ top: `${5 + (shell.liveTrip ? 6.5 : 0)}rem` }}
        >
          <TripSearchStack />
        </div>
      )}

      {isPanel ? (
        <>
          <MapPanel
            key={pathname}
            title={panel.title}
            snap={sheetSnap}
            onSnapChange={(snap) => setSheet({ key: locationKey, snap })}
            onCollapse={() => setCollapsedFor(locationKey)}
            collapsed={collapsed}
            hideOnMobile={placingPin}
          >
            <Outlet />
          </MapPanel>

          {/* Larger screens: a tab on the panel's edge (like Google Maps) that hides it and
              brings it back from the same spot. */}
          <button
            type="button"
            onClick={() => setCollapsedFor(collapsed ? null : locationKey)}
            aria-label={collapsed ? `Show ${panel.title}` : 'Hide panel'}
            className={cn(
              'max-md:hidden fixed top-1/2 -translate-y-1/2 z-[45] w-6 h-14 rounded-r-xl flex items-center justify-center text-navy-900 hover:bg-white transition-colors',
              GLASS,
              'border-l-0',
              collapsed ? 'left-0' : 'left-[420px]'
            )}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </>
      ) : (
        <>
          {/* Home: the screen scrolls over the fixed map. Its first block is a
              transparent, click-through window onto the map. */}
          <div className="relative z-10 pointer-events-none">
            <Outlet />
          </div>

          {/* The map takes drags and the mouse wheel, so the page can't scroll
              from over it — this button scrolls past it. Sits above the map credit. */}
          {!placingPin && (
            <button
              type="button"
              onClick={scrollPastMap}
              aria-label="Scroll to more"
              className={cn(
                'absolute right-4 top-[calc(100dvh-9rem)] z-20 w-12 h-12 rounded-full flex items-center justify-center text-navy-900 hover:bg-white/90 transition-colors',
                GLASS
              )}
            >
              <ChevronDown className="w-6 h-6" />
            </button>
          )}
        </>
      )}
    </div>
  )
}
