# Editing and cancelling a ride

See also [ride-requests.md](ride-requests.md) for `14_ride_request_visibility.sql`, added in the
same batch of changes — restricting who can browse open ride requests.

Needs migration [`13_ride_editing.sql`](../supabase/migrations/13_ride_editing.sql), and
[`16_fix_departure_check.sql`](../supabase/migrations/16_fix_departure_check.sql) — without it, "Mark Trip
Completed" and "Didn't happen" fail outright on any ride more than an hour past its departure time (a bug in the
base schema, not in this feature).

## What a driver can do to their own ride

| Action | Where | Notes |
|---|---|---|
| **Create** | Offer a Ride | — |
| **Edit** | "Edit" on Ride Details or My Rides (`/rides/:id/edit`) | See rule below |
| **Adjust seats on the road** | Seats −/+ on the trip bar or My Rides | Unaffected by editing — see [trips-and-seats.md](trips-and-seats.md) |
| **Cancel** (before departure) | "Cancel Ride" on My Rides | Sets the ride to `cancelled`; it stays in the database (bookings and reviews reference it) and any free bookings on it are cancelled too. There's no hard delete. |
| **Mark completed** (after departure) | "Mark Trip Completed" on My Rides | Sets the ride and its confirmed bookings to `completed` — this is what unlocks reviews (their RLS insert policy requires it). Manual only; nothing marks a ride completed automatically. |
| **"Didn't happen"** (after departure) | "Didn't happen" next to Mark Trip Completed | For when the ride fell through and nobody used "Cancel Ride" in time. Same cancellation as above (seats freed, free bookings cancelled, paid ones refunded) — a driver isn't stuck choosing between falsely marking a ride "completed" or leaving it sitting there forever. |

Both post-departure actions only appear once `departure_time` has passed; before that, only "Cancel Ride" shows.
A banner at the top of My Rides — *"Did your ride happen?"* — nudges the driver toward one of them once a ride
has sat unresolved for **3 hours** past its departure time (`ridesNeedingClosure` in `MyRidesPage.tsx`), tapping
through to the Driving tab. Deliberately a nudge, not an automatic status change: auto-completing would
implicitly assert a ride happened when the driver never confirmed that, which would let people review a ride
that may have fallen through.

## Driving tab order

Active/Full rides first (soonest departure first — same as before), then Completed/Cancelled ones below them,
most recently departed first. A client-side sort (`sortedMyRides` in `MyRidesPage.tsx`), not a different query:
without it, a finished ride's departure time is still the *earliest* on record, so a plain "soonest first" sort
would put it ahead of rides still coming up.

## The editing rule

Once a ride has taken a seat — a booking of any live status, or the driver's own seat
adjustment — its **route, date/time, price and seat count lock**. Changing them out from under
someone who already committed isn't fair. **Notes and car details (brand, model, year, photo)
can always be edited**, whatever the ride's state.

"Taken a seat" is checked as: `available_seats = total_seats` (nothing has moved it) **and** no
booking exists on the ride except cancelled ones. Either check alone already implies the other in
normal use; both are checked as a safety net.

The rule is enforced by a **database trigger** (`guard_ride_edit`, migration 13), not just in the
app: a driver could already update any column on their own ride via the existing RLS policy
("Drivers can update own rides", `01_schema.sql`) — the app simply never offered a form for it.
The trigger closes that gap for every update path, present or future, not only the edit page.

`EditRidePage` reads `ridesRepository.getRideForEdit()`, which predicts whether the ride still
qualifies (`fullyEditable`) so the driver sees the locked state up front; the database is still
the one that actually enforces it, and returns an error if something changed in between (e.g. a
booking arrived while the form was open).

## Data

- Trigger `public.guard_ride_edit()` on `rides`, runs before `rides_sync_full_status` (09) and
  `rides_updated_at` (01) so `available_seats` is settled first when the seat count itself
  changes (kept equal to the new total, same as at creation).
- `ridesRepository.getRideForEdit(rideId)`, `ridesRepository.updateRide(rideId, updates)`.
- `src/domains/core/rides/pages/EditRidePage.tsx` — the same fields as Offer a Ride, prefilled;
  shows only notes and car details once the ride is locked.
