# Editing and cancelling a ride

See also [ride-requests.md](ride-requests.md) for `14_ride_request_visibility.sql`, added in the
same batch of changes — restricting who can browse open ride requests.

Needs migration [`13_ride_editing.sql`](../supabase/migrations/13_ride_editing.sql).

## What a driver can do to their own ride

| Action | Where | Notes |
|---|---|---|
| **Create** | Offer a Ride | — |
| **Edit** | "Edit" on Ride Details or My Rides (`/rides/:id/edit`) | See rule below |
| **Adjust seats on the road** | Seats −/+ on the trip bar or My Rides | Unaffected by editing — see [trips-and-seats.md](trips-and-seats.md) |
| **Cancel** | "Cancel Ride" on My Rides | Sets the ride to `cancelled`; it stays in the database (bookings and reviews reference it) and any free bookings on it are cancelled too. There's no hard delete. |

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
