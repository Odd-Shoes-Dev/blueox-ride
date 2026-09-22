# Ride requests (passenger-posted demand)

Needs migrations [`07_ride_requests.sql`](../supabase/migrations/07_ride_requests.sql) and
[`14_ride_request_visibility.sql`](../supabase/migrations/14_ride_request_visibility.sql).

Not to be confused with [booking-requests.md](booking-requests.md) (a rider asking a specific
driver for a seat on their ride). A ride request is the other direction: a rider posts what they
need — route, date, seats, budget — with no ride to attach it to yet, and any driver can accept it,
which creates a real ride and booking on the spot. No in-app negotiation; the budget is what it is.

## Who sees an open request

**Signed-in users only.** Posting a request and accepting one already require being signed in;
migration 14 made *browsing* them require it too — the original rule had no such check, so an
open request's route, budget and notes were readable by anyone on the internet, signed in or not.
The list query's passenger join is also narrower than before: a name, avatar and rating, not phone
or email — those are only shared once a driver actually accepts, the same as any other booking.

A driver doesn't choose who can see their own request-browsing; every signed-in user sees the same
open list. There's no per-driver targeting or "only drivers on this route" filter yet — see
[future-ideas.md](future-ideas.md) if that's worth adding.

## Where a driver finds them

- **Ride Requests** (`/requests`): the full list, with route, date, seats, budget and an Accept
  button. The home screen's "Ride Requests" card shows a live count ("N riders waiting for a
  driver") for signed-in users, so the demand is visible without a click.
- **On the map**, while the Ride Requests page is open: each open request shows as its own pin at
  its pickup point — hollow, dashed and amber, to read as "wanted" rather than "offered" next to
  the solid pins of posted rides. Tapping one opens the same Accept dialog as tapping its card.
  Pins disappear when the page closes; there's no map view of requests anywhere else, and no route
  line for one (only a pickup pin) since a request has no assigned driver yet.

## Accepting

`accept_ride_request()` atomically creates a real `ride` (owned by the accepting driver) and a
`booking` (owned the request's passenger) at the passenger's stated budget, and marks the request
matched. Payment/refund/cancellation code afterward treats it as an ordinary ride and booking —
it never has to know a request was involved.

## Data

- `ride_requests` table, `rideRequestsRepository.ts`.
- `RideRequestsPage.tsx` (the list + Accept dialog), `RequestRidePage.tsx` (posting one).
- Map pins: `MapShellContext`'s `requestPins`/`selectedRequestId` (set by
  `useRideRequestPins()`, read by `MapShell.tsx`), rendered in `HeroLiveMap.tsx`.
