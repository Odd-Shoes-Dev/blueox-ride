import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './client'

// Live driver-location sharing uses a Realtime Broadcast channel scoped by ride id
// rather than a database table — there's no need to persist a history of GPS pings,
// only "where is the driver right now" for whoever is currently listening.
//
// The channel is PRIVATE. Ride ids aren't secret (they're in every ride's link), so the
// name can't protect it; instead, database rules on realtime.messages (migration
// 12_private_live_location.sql) allow only the ride's driver to send and only the driver and
// passengers with a confirmed booking to listen. Everyone else — including people who aren't
// signed in — is refused when they try to join. See docs/privacy-and-consent.md.

export interface DriverLocationUpdate {
  lat: number
  lng: number
  heading?: number
  timestamp: number
}

function channelName(rideId: string): string {
  return `ride-location-${rideId}`
}

// A passenger's own share with the driver — one channel per (ride, passenger) pair, not one
// shared per ride, so a passenger's position is never visible to any other passenger (migration
// 21). Off unless app_settings.passenger_location_sharing_enabled is on; see AppSettingsContext.
function passengerChannelName(rideId: string, passengerId: string): string {
  return `ride-passenger-${rideId}-${passengerId}`
}

function openPrivateChannel(name: string): RealtimeChannel {
  return supabase.channel(name, { config: { private: true } })
}

// Private channels need the signed-in user's token on the realtime connection *before*
// joining, or the join is refused. `isCancelled` covers the caller stopping in the meantime.
async function joinWhenAuthorised(channel: RealtimeChannel, isCancelled: () => boolean): Promise<void> {
  try {
    await supabase.realtime.setAuth()
  } catch (error) {
    console.error('Could not authorise the live-location channel:', error)
  }
  if (isCancelled()) return

  channel.subscribe((status, error) => {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error(`Live-location channel ${status}`, error)
    }
  })
}

export interface LocationBroadcaster {
  send: (location: Omit<DriverLocationUpdate, 'timestamp'>) => void
  stop: () => void
}

// Driver side: call send() periodically while sharing; stop() when done.
export function createLocationBroadcaster(rideId: string): LocationBroadcaster {
  const channel = openPrivateChannel(channelName(rideId))
  let stopped = false
  void joinWhenAuthorised(channel, () => stopped)

  return {
    send: (location) => {
      channel.send({
        type: 'broadcast',
        event: 'location',
        payload: { ...location, timestamp: Date.now() },
      })
    },
    stop: () => {
      stopped = true
      supabase.removeChannel(channel)
    },
  }
}

// Passenger side: subscribes to live updates for a ride's driver location.
// Returns an unsubscribe function.
export function subscribeToDriverLocation(
  rideId: string,
  onUpdate: (location: DriverLocationUpdate) => void
): () => void {
  const channel = openPrivateChannel(channelName(rideId))
  let stopped = false

  channel.on('broadcast', { event: 'location' }, ({ payload }) => {
    onUpdate(payload as DriverLocationUpdate)
  })
  void joinWhenAuthorised(channel, () => stopped)

  return () => {
    stopped = true
    supabase.removeChannel(channel)
  }
}

// Passenger side: call send() periodically while sharing with the driver; stop() when done.
export function createPassengerLocationBroadcaster(rideId: string, passengerId: string): LocationBroadcaster {
  const channel = openPrivateChannel(passengerChannelName(rideId, passengerId))
  let stopped = false
  void joinWhenAuthorised(channel, () => stopped)

  return {
    send: (location) => {
      channel.send({
        type: 'broadcast',
        event: 'location',
        payload: { ...location, timestamp: Date.now() },
      })
    },
    stop: () => {
      stopped = true
      supabase.removeChannel(channel)
    },
  }
}

// Driver side (or the passenger's own other tab): subscribes to one passenger's live position.
// Returns an unsubscribe function. Silence forever just means that passenger never opted in —
// there's no separate "did they say yes" signal to check first.
export function subscribeToPassengerLocation(
  rideId: string,
  passengerId: string,
  onUpdate: (location: DriverLocationUpdate) => void
): () => void {
  const channel = openPrivateChannel(passengerChannelName(rideId, passengerId))
  let stopped = false

  channel.on('broadcast', { event: 'location' }, ({ payload }) => {
    onUpdate(payload as DriverLocationUpdate)
  })
  void joinWhenAuthorised(channel, () => stopped)

  return () => {
    stopped = true
    supabase.removeChannel(channel)
  }
}
