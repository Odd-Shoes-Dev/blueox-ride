import { supabase } from './client'

// Live driver-location sharing uses a Realtime Broadcast channel scoped by
// ride id rather than a database table — there's no need to persist a
// history of GPS pings, only "where is the driver right now" for whoever is
// currently subscribed. Channel names are unguessable (ride UUIDs), the same
// obscurity model already used for the payment-status broadcast channel in
// paymentsRepository — not RLS-enforced, but consistent with the existing
// security posture rather than a new weaker pattern.

export interface DriverLocationUpdate {
  lat: number
  lng: number
  heading?: number
  timestamp: number
}

function channelName(rideId: string): string {
  return `ride-location-${rideId}`
}

export interface LocationBroadcaster {
  send: (location: Omit<DriverLocationUpdate, 'timestamp'>) => void
  stop: () => void
}

// Driver side: call send() periodically while sharing; stop() when done.
export function createLocationBroadcaster(rideId: string): LocationBroadcaster {
  const channel = supabase.channel(channelName(rideId))
  channel.subscribe()

  return {
    send: (location) => {
      channel.send({
        type: 'broadcast',
        event: 'location',
        payload: { ...location, timestamp: Date.now() },
      })
    },
    stop: () => {
      supabase.removeChannel(channel)
    },
  }
}

// Rider side: subscribes to live updates for a ride's driver location.
// Returns an unsubscribe function.
export function subscribeToDriverLocation(
  rideId: string,
  onUpdate: (location: DriverLocationUpdate) => void
): () => void {
  const channel = supabase.channel(channelName(rideId))

  channel
    .on('broadcast', { event: 'location' }, ({ payload }) => {
      onUpdate(payload as DriverLocationUpdate)
    })
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
