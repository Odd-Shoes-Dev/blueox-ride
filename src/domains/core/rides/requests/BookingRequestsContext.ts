import { createContext, useContext } from 'react'
import type { DeclineReason } from '@/shared/types'

// Must match the limit enforced in the database (supabase migration 10).
export const MAX_REQUEST_ATTEMPTS = 3

export const DECLINE_REASON_LABELS: Record<DeclineReason, string> = {
  offer_too_low: 'The offer is too low',
  pickup_too_far: 'The pickup is too far off my route',
  seats_reserved: 'The seats are reserved',
  other: 'Other reason',
}

export interface BookingRequestsState {
  // Requests waiting for this user's answer as a driver (drives the badge on My Rides)
  pendingCount: number
  // Goes up whenever a request changes, so screens showing requests know to reload
  version: number
  refresh: () => void
}

export const BookingRequestsContext = createContext<BookingRequestsState>({
  pendingCount: 0,
  version: 0,
  refresh: () => {},
})

export function useBookingRequests(): BookingRequestsState {
  return useContext(BookingRequestsContext)
}
