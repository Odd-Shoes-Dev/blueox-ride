# Booking requests

Needs migration [`10_booking_requests.sql`](../supabase/migrations/10_booking_requests.sql).

## What it is

Normally a passenger books a seat instantly: the whole route, at the driver's listed price per seat.
A **booking request** is for everything else. The passenger asks the driver for a seat with:

- their own **pickup** and/or **drop-off** somewhere along the way (optional),
- their own **offer** — what they can pay per seat (defaults to the listed price).

The driver sees where the rider would get in and off, how far that is from their route, and what is
offered against their listed price, and **accepts or refuses**. Accepting creates a normal confirmed
booking, so seats, "picked up", no-shows and trip mode all work as they do for any booking.

## Why

- Lets riders join or leave part-way (roadside pickups) without any special booking type.
- Makes the price flexible without price ranges: the listed price is the anchor, the offer is the flexible part.
- Gives the driver control over who rides with them and at what price.

## When a booking becomes a request

On the ride page, in the booking dialog:

| The rider… | Result |
|------------|--------|
| keeps the ride's own start and end, and offers the listed price or more | **Instant booking** (as before) |
| picks their own pickup or drop-off, **or** offers less than the listed price | **Request** to the driver |

A guide for part-trip pricing ("about UGX 9,000 would be a fair share") is shown when stops are chosen,
worked out from where the stops sit along the ride's route. It is only a suggestion.

## Rules (enforced in the database)

These are in the SQL functions, so they can't be bypassed from the app.

- **Up to 3 requests per rider per ride** — the first, plus two retries. Every request counts,
  including withdrawn ones (so withdrawing and resending can't be used to spam).
- **A retry after a refusal must change something**: the offer, seats, pickup or drop-off.
- **One waiting request per rider per ride**, and **at most 5 waiting across all rides**.
- **A request expires** after 2 hours, or at departure if that is sooner. Expired and withdrawn requests
  are not refusals.
- **The driver can refuse with a reason** — offer too low, pickup too far off the route, seats reserved,
  other — and can tick **"don't accept more from this person on this ride"**. That blocks further
  requests *and* instant booking on that ride for that rider.
- Requests don't hold a seat. Seats are taken only when the driver accepts (first accepted wins the last seat).

The limit of 3 is `MAX_REQUEST_ATTEMPTS` in `src/domains/core/rides/requests/BookingRequestsContext.ts`
and `c_max_attempts` in the SQL. Change both together.

## Data

- `booking_requests` table: one row per attempt (seats, offer, pickup/drop-off, status, decline reason,
  `blocked`, `attempt_no`, `expires_at`, and the `booking_id` once accepted). Each side can read only its
  own rows; nobody writes to the table directly.
- `bookings` gained `pickup_*`, `dropoff_*` and `agreed_price` (NULL means the ride's listed price).
- Functions: `request_booking()`, `withdraw_booking_request()`, `respond_to_booking_request()` (returns
  `accepted`, `declined` or `expired`). `book_ride()` was updated to respect a driver's block.
- The table is added to Supabase Realtime, which is what makes notifications instant.

## Screens and notifications

- **Ride page** (rider): booking dialog with stops and offer; a card showing a waiting request (with
  Withdraw) or the last refusal (with reason, attempts left, "Ask again"). Driver: a card when requests are waiting.
- **Booking requests page** (`/booking-requests`, `src/domains/core/rides/pages/BookingRequestsPage.tsx`):
  - *For my rides* (driver): each request with the rider, pickup and drop-off, straight-line distances from the
    ride's start and end, seats, the offer against the listed price, what the driver would receive,
    time left, **Accept**, **Refuse** and **Show on map**. Answered requests are listed below.
  - *My requests* (rider): everything they sent, with status, and Withdraw for waiting ones.
- **Notifications** (`BookingRequestsProvider`): while the app is open, a pop-up when a request arrives
  (driver) or is answered (rider), and a number badge on **My Rides** in the bottom bar. There is also a
  banner on My Rides. Phone push notifications for when the app is closed are a later step — see
  [future-ideas.md](future-ideas.md).

## Known limits

- Distances shown to the driver are **straight-line**, not along the road, and there is no measure yet of
  how far the pickup is off the driver's route.
- Rides aren't searchable by "passes near me" yet, so a rider finds a ride first (start-to-end matching)
  and then asks for their own stops.
- Requests only notify while the app is open.
