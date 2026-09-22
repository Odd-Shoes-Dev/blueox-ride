import { useEffect, useState } from 'react'
import { rideRequestsRepository } from '@/shared/services/database'
import { useAuth } from '@/domains/core/auth/AuthContext'

// How many open "I need a ride" posts exist right now — a concrete demand signal ("N riders
// waiting") for a driver, instead of a generic "check for requests" link. Shared by the home
// screen's quick-action card and My Rides' Driving tab, so both stay in sync without each
// fetching it separately.
//
// null = "don't know" (still loading, or signed out): open requests are only readable once
// signed in (migration 14), so a guest would otherwise always see 0 here, which would wrongly
// report there being none at all rather than "you'd need to sign in to see."
export function useOpenRequestCount(): number | null {
  const { user } = useAuth()
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!user) {
      // Deferred (not called synchronously in the effect body) per the project's lint rule.
      const timer = setTimeout(() => setCount(null), 0)
      return () => clearTimeout(timer)
    }
    rideRequestsRepository
      .getOpenRideRequests()
      .then((requests) => setCount(requests.length))
      .catch(() => setCount(null))
  }, [user])

  return count
}
