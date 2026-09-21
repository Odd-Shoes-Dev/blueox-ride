import { Link, useNavigate } from 'react-router-dom'
import { Loader2, MapPin, Search, Star } from 'lucide-react'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { useMapShell } from '@/domains/core/rides/map/MapShellContext'
import { LocationPicker } from '@/domains/core/rides/components/LocationPicker'
import { RoutePreviewChip } from '@/domains/core/rides/components/RoutePreviewChip'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { formatDate } from '@/shared/lib/utils'

// Semi-transparent white surface for controls floating over the map. Text on it is
// always navy (not theme-dependent) since what's behind it is the map, not the page.
// `pointer-events-auto` because whatever positions this stack is click-through.
const GLASS = 'bg-white/80 border border-white/50 shadow-lg pointer-events-auto'

// The "where are you going?" search card, with the previewed route's chip and the
// driver's next ride under it. It floats on the map, and is shown by the home screen
// and by any screen whose panel is minimised — so the way back to searching is
// always to slide the panel away. The trip itself (pickup, destination) is held by
// the map shell, so it's the same trip wherever the card appears.
// The caller positions it (it is only a max-width column).
export function TripSearchStack() {
  const { user } = useAuth()
  const shell = useMapShell()
  const navigate = useNavigate()
  const {
    searching,
    origin: searchOrigin,
    destination: searchDestination,
    setOrigin: setSearchOrigin,
    setDestination: setSearchDestination,
    locatingUser,
    usingAutoPickup,
    setManualPickupOverride,
  } = shell
  const myNextRide = user ? shell.myRides[0] : undefined

  // Look for rides near the pickup and destination, then open the results next to the map.
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    await shell.searchRides()
    navigate('/results')
  }

  return (
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
  )
}
