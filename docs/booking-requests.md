# Booking requests

Needs migration [`10_booking_requests.sql`](../supabase/migrations/10_booking_requests.sql), and
[`15_always_ask_driver.sql`](../supabase/migrations/15_always_ask_driver.sql) for what's on this page —
there is no longer an instant-booking path at all.

## What it is

Every booking on a driver-posted ride is a **request**, whatever it asks for. The passenger picks
seats, their own **pickup** and/or **drop-off** (which may just be the ride's own start and end),
and an **offer** per seat (defaults to the listed price, but can be more if they're going further
than the route, or less if they're getting off sooner). The driver sees who's asking, their
itinerary drawn next to the driver's own route, and the offer against the listed price, and
**accepts or refuses**. Nothing is ever confirmed without the driver's own action — there's no
faster path that skips this, for anyone, including a plain "same route, listed price" booking.

Accepting creates a normal confirmed booking, so seats, "picked up", no-shows and trip mode all
work as they do for any booking.

## Why

- **The driver always sees who they're taking before it's certain**, not after. A seat is never
  taken by someone the driver hasn't had a chance to decline.
- **A driver can compare requests and pick the better one** — e.g. a higher offer for the same
  seats — instead of it being whoever books first. Requests for a ride are shown highest offer
  first for this reason.
- Lets riders join or leave part-way (roadside pickups) without any special booking type.
- Makes the price flexible without price ranges: the listed price is the anchor, the offer is the
  flexible part.

(This is the direction of a passenger asking a driver on a posted ride. The other direction — a
driver accepting a passenger's *posted* "I need a ride" — is a different feature; see
[ride-requests.md](ride-requests.md). There, the driver's own tap on Accept is already their
confirmation, so it was never instant either.)

A guide for part-trip pricing ("about UGX 9,000 would be a fair share") is shown when stops are
chosen, worked out from where the stops sit along the ride's route. It is only a suggestion.

## Rules (enforced in the database)

These are in the SQL functions, so they can't be bypassed from the app.

- **Up to 4 requests per rider per ride** — the first, plus three retries. Every request counts,
  including withdrawn ones (so withdrawing and resending can't be used to spam).
- **A retry after a refusal must change something**: the offer, seats, pickup or drop-off.
- **One waiting request per rider per ride**, and **at most 5 waiting across all rides**.
- **A request expires at the ride's departure time.** Earlier requests were capped at 2 hours,
  which made sense as a fallback for a supplementary path — now that every booking works this
  way, a request stays open for the driver to answer for as long as the ride hasn't left. By the
  time one does expire, the ride has already departed, so there's nothing left to retry.
- **The driver can refuse with a reason** — offer too low, pickup too far off the route, seats
  reserved, other — and can tick **"don't accept more from this person on this ride"**. That
  blocks further requests from that rider on that ride.
- Requests don't hold a seat. Seats are taken only when the driver accepts — if two people are
  waiting on the same seats, whoever the driver accepts first gets them; accepting a second one
  afterward fails cleanly if the seats are already gone.

The limit of 4 is `MAX_REQUEST_ATTEMPTS` in `src/domains/core/rides/requests/BookingRequestsContext.ts`
and `c_max_attempts` in the SQL. Change both together.

## Data

- `booking_requests` table: one row per attempt (seats, offer, pickup/drop-off, status, decline
  reason, `blocked`, `attempt_no`, `expires_at`, and the `booking_id` once accepted). Each side
  can read only its own rows; nobody writes to the table directly.
- `bookings` gained `pickup_*`, `dropoff_*` and `agreed_price` (NULL means the ride's listed price).
- Functions: `request_booking()`, `withdraw_booking_request()`, `respond_to_booking_request()`
  (returns `accepted`, `declined` or `expired`).
- `book_ride()` (migration 08's instant-booking function) is no longer called by the app, and its
  `EXECUTE` grant was revoked (migration 15) so it can't be called directly either. It's left in
  place rather than dropped, in case anything ever needs the definition for reference.
- The table is added to Supabase Realtime, which is what makes notifications instant.

## Screens and notifications

- **Ride page** (rider): the booking dialog (seats, own stops, offer) always sends a request; a
  card shows a waiting request (with Withdraw) or the last refusal (with reason, attempts left,
  "Ask again"). Driver: a card when requests are waiting.
- **Booking requests page** (`/booking-requests`, `src/domains/core/rides/pages/BookingRequestsPage.tsx`):
  - *For my rides* (driver): each request with the rider, pickup and drop-off, straight-line
    distances from the ride's start and end, seats, the offer against the listed price, what the
    driver would receive, time left, **Accept**, **Refuse** and **Show on map** (draws the ride's
    own route and the passenger's chosen pickup/drop-off pins together). Sorted by offer,
    highest first. Answered requests are listed below.
  - *My requests* (rider): everything they sent, with status, and Withdraw for waiting ones.
- **Notifications** (`BookingRequestsProvider`): while the app is open, a pop-up when a request
  arrives (driver) or is answered (rider), and a number badge on **My Rides** in the bottom bar.
  There is also a banner on My Rides. Phone push notifications for when the app is closed are a
  later step — see [future-ideas.md](future-ideas.md), and matter more now that every booking
  depends on a driver seeing it in time.

## Known limits

- Distances shown to the driver are **straight-line**, not along the road, and there is no
  measure yet of how far the pickup is off the driver's route.
- Rides aren't searchable by "passes near me" yet, so a rider finds a ride first (start-to-end
  matching) and then asks for their own stops.
- Requests only notify while the app is open — see the note above on push notifications.

## The booking dialog

On the ride page, closed by default: seats, phone, and "Request to Book." Changing the stops or
offer is a single subtle reveal — *"Want a different pickup, drop-off or price?"* — closed the
same way a login card tucks "Forgot password?" out of the way, rather than an always-visible
field that looked mandatory. Leaving it closed sends the ride's own start, end and listed price.

The sticky button that opens it and the "How booking works" card both describe the real order now
(send a request → the driver accepts → contact and payment follow), not the old instant-booking
wording.
