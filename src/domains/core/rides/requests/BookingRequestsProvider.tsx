import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { bookingRequestsRepository } from '@/shared/services/database'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { useToast } from '@/shared/hooks/use-toast'
import { formatCurrency } from '@/shared/lib/utils'
import {
  BookingRequestsContext,
  DECLINE_REASON_LABELS,
  type BookingRequestsState,
} from '@/domains/core/rides/requests/BookingRequestsContext'

// How often to re-count waiting requests, so ones that ran out of time drop off the badge.
const RECOUNT_MS = 60_000

// Keeps track of booking requests for the signed-in user and tells them the moment something
// happens: a driver when a request arrives, a passenger when theirs is accepted or refused.
// Works while the app is open; phone push notifications for when it isn't are a later step
// (see docs/future-ideas.md).
export function BookingRequestsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const userId = user?.id
  const [pendingCount, setPendingCount] = useState(0)
  const [version, setVersion] = useState(0)

  const recount = useCallback(async () => {
    if (!userId) return
    try {
      setPendingCount(await bookingRequestsRepository.countPendingForDriver(userId))
    } catch (error) {
      console.error('Could not count booking requests:', error)
    }
  }, [userId])

  const refresh = useCallback(() => {
    recount()
    setVersion((current) => current + 1)
  }, [recount])

  useEffect(() => {
    // First count a tick later (so the effect body sets no state itself), then keep re-counting.
    const first = setTimeout(recount, 0)
    const id = setInterval(recount, RECOUNT_MS)
    return () => {
      clearTimeout(first)
      clearInterval(id)
    }
  }, [recount])

  useEffect(() => {
    if (!userId) return

    return bookingRequestsRepository.subscribeToRequestChanges(userId, {
      onDriverChange: async (event, request) => {
        refresh()
        if (event !== 'INSERT') return

        // The change carries only the request row; look up who asked, and for which ride.
        try {
          const detail = await bookingRequestsRepository.getRequestWithDetails(request.id)
          toast({
            title: 'New booking request',
            description: detail
              ? `${detail.passenger.full_name} offers ${formatCurrency(detail.offer_price)}/seat for ${detail.ride.origin_name} → ${detail.ride.destination_name}. Open My Rides to answer.`
              : 'Someone asked for a seat on your ride. Open My Rides to answer.',
          })
        } catch {
          toast({ title: 'New booking request', description: 'Someone asked for a seat on your ride.' })
        }
      },
      onPassengerChange: (request) => {
        refresh()
        if (request.status === 'accepted') {
          toast({
            title: 'Request accepted!',
            description: "The driver accepted your request. You're booked — check My Rides for the details.",
            variant: 'success',
          })
        } else if (request.status === 'declined') {
          const reason = request.decline_reason ? DECLINE_REASON_LABELS[request.decline_reason] : null
          toast({
            title: 'Request declined',
            description: reason ? `${reason}. You can try again with a different offer or stops.` : 'The driver declined your request.',
            variant: 'destructive',
          })
        }
      },
    })
  }, [userId, refresh, toast])

  // Signed out: nothing is waiting, whatever the last count was.
  const value = useMemo<BookingRequestsState>(
    () => ({ pendingCount: userId ? pendingCount : 0, version, refresh }),
    [userId, pendingCount, version, refresh]
  )

  return <BookingRequestsContext.Provider value={value}>{children}</BookingRequestsContext.Provider>
}
