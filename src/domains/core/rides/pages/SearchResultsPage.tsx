import { useNavigate } from 'react-router-dom'
import { SearchX, MapPin } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Card, CardContent } from '@/shared/ui/card'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { PageContainer } from '@/shared/components/PageContainer'
import { RideCard } from '@/domains/core/rides/components/RideCard'
import { useMapShell } from '@/domains/core/rides/map/MapShellContext'
import { formatDistance } from '@/domains/core/rides/hooks/useRideRouteOnMap'
import { WIDE_SEARCH_RADIUS_KM } from '@/domains/core/rides/map/searchConstants'

// What "Find a Ride" on the home screen leads to: rides that start near the pickup and
// end near the destination — matched by distance, so it works even when place names
// are spelled differently. Their start points are shown on the map behind this panel,
// along with the trip itself (your destination and the dashed line to it).
export default function SearchResultsPage() {
  const shell = useMapShell()
  const navigate = useNavigate()
  const results = shell.results

  return (
    <div className="min-h-full bg-background pb-8">
      <div className="bg-header text-header-foreground pt-12 pb-6 px-4">
        <PageContainer>
          <h1 className="text-xl font-semibold text-header-foreground">Ride results</h1>
          {results && (
            <p className="text-header-foreground/80 text-sm mt-1">
              {results.origin ? `${results.origin.name} → ` : 'Anywhere → '}
              {results.destination ? results.destination.name : 'anywhere'}
            </p>
          )}
        </PageContainer>
      </div>

      <div className="px-4 mt-4">
        <PageContainer className="space-y-4">
          {!results ? (
            <Card>
              <CardContent className="p-8 text-center">
                <MapPin className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">No search yet</p>
                <p className="text-sm text-muted-foreground mt-1 mb-4">
                  Choose where you're going on the home screen and press Find a Ride.
                </p>
                <Button onClick={() => navigate('/')}>Back to the map</Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Refine: date and distance */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="results-date">Leaving on (optional)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="results-date"
                        type="date"
                        value={results.date ?? ''}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => shell.searchRides({ date: e.target.value || undefined, radiusKm: results.radiusKm })}
                      />
                      {results.date && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => shell.searchRides({ radiusKm: results.radiusKm })}
                        >
                          Any day
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Showing rides that start within {results.radiusKm} km of your pickup and end within {results.radiusKm} km of your
                    destination
                    {results.radiusKm < WIDE_SEARCH_RADIUS_KM && (
                      <>
                        .{' '}
                        <button
                          type="button"
                          className="text-primary underline"
                          onClick={() => shell.searchRides({ date: results.date, radiusKm: WIDE_SEARCH_RADIUS_KM })}
                        >
                          Search wider ({WIDE_SEARCH_RADIUS_KM} km)
                        </button>
                      </>
                    )}
                  </p>
                </CardContent>
              </Card>

              <p className="text-sm font-medium px-1">
                {shell.searching
                  ? 'Searching…'
                  : results.rides.length === 0
                    ? 'No rides found'
                    : `${results.rides.length} ride${results.rides.length === 1 ? '' : 's'} found`}
              </p>

              {results.rides.length === 0 && !shell.searching ? (
                <Card>
                  <CardContent className="p-6 text-center">
                    <SearchX className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                    <p className="font-medium">Nothing along that route yet</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">
                      {results.radiusKm < WIDE_SEARCH_RADIUS_KM
                        ? 'Try a wider search, or let drivers come to you.'
                        : 'Let drivers come to you: post what you need and they can accept it.'}
                    </p>
                    <div className="flex flex-col gap-2">
                      {results.radiusKm < WIDE_SEARCH_RADIUS_KM && (
                        <Button
                          variant="outline"
                          onClick={() => shell.searchRides({ date: results.date, radiusKm: WIDE_SEARCH_RADIUS_KM })}
                        >
                          Search within {WIDE_SEARCH_RADIUS_KM} km
                        </Button>
                      )}
                      <Button
                        onClick={() =>
                          navigate('/requests/new', { state: { origin: results.origin, destination: results.destination } })
                        }
                      >
                        Post a ride request
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {results.rides.map((ride) => (
                    <RideCard
                      key={ride.id}
                      ride={ride}
                      note={matchNote(ride.match, results.origin !== null, results.destination !== null)}
                      onOpen={() => shell.previewRide(ride)}
                    />
                  ))}
                </div>
              )}

              <Button variant="ghost" className="w-full" onClick={() => { shell.clearResults(); navigate('/') }}>
                Clear search
              </Button>
            </>
          )}
        </PageContainer>
      </div>
    </div>
  )
}

// "Starts 2.3 km from you · ends 4 km from your destination" — how close a ride is.
function matchNote(match: { originKm: number | null; destinationKm: number | null }, hadOrigin: boolean, hadDestination: boolean): string | undefined {
  const parts: string[] = []
  if (hadOrigin && match.originKm !== null) {
    parts.push(match.originKm < 0.1 ? 'Starts right at your pickup' : `Starts ${formatDistance(match.originKm)} from your pickup`)
  }
  if (hadDestination && match.destinationKm !== null) {
    parts.push(
      match.destinationKm < 0.1 ? 'ends right at your destination' : `ends ${formatDistance(match.destinationKm)} from your destination`
    )
  }
  if (parts.length === 0) return undefined
  const text = parts.join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

