import { Link } from 'react-router-dom'
import { Calendar, Users, Star } from 'lucide-react'
import { Card, CardContent } from '@/shared/ui/card'
import { formatCurrency, formatDate } from '@/shared/lib/utils'
import type { RideWithDriver } from '@/domains/core/rides/map/MapShellContext'

interface RideCardProps {
  ride: RideWithDriver
  // Extra line under the route, e.g. how close the ride is to what was searched for
  note?: string
  // Called as the card is opened (e.g. to start drawing its route on the map straight away)
  onOpen?: () => void
}

// A ride in a list: route, price, when, seats, car and driver. Opens the ride.
export function RideCard({ ride, note, onOpen }: RideCardProps) {
  return (
    <Link to={`/rides/${ride.id}`} onClick={onOpen}>
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
              {note && <p className="mt-2 text-xs text-green-700">{note}</p>}
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
