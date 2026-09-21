# Trips and seats

Seat controls need migration [`09_seat_controls.sql`](../supabase/migrations/09_seat_controls.sql).

## How seats work

- A driver posts a ride with a number of seats (1–8). **Seats left** starts equal to it.
- When a booking is **confirmed**, its seats come off "seats left" (a database rule). At 0 the ride becomes
  **Full** and stops being bookable. Cancelling a confirmed booking gives the seats back.
- A ride's Active/Full status follows its seats however they change (booking, cancellation, or the driver).
  A ride that is cancelled or completed is left alone.

## What the driver can do

- **Seats − / +**: change seats left by hand. Tap − when someone gets in on the road, + when a seat frees up.
  Available on the trip bar (during a trip) and on each ride card in My Rides → Driving. Seats stay between 0 and the total.
- **Picked up**: tick a booked passenger as "in the car". It shows "2 of 3 in the car" and does not change the
  seat count (the seat was reserved at booking).
- **No-show**: a booked passenger never turned up — cancels their booking and frees the seat. Allowed once the
  trip is within an hour of leaving. Any fee paid isn't refunded (same as a late cancellation). Their booking
  shows "No-show".

Code: `src/domains/core/rides/pages/MyRidesPage.tsx`, `src/domains/core/rides/components/TripBar.tsx`,
functions `adjust_ride_seats`, `set_booking_picked_up`, `mark_booking_no_show`.

## Live trip mode

- The driver taps **Start trip** on their ride and confirms "Your location will be shared with passengers on this
  ride until you end the trip". Their position is then read continuously, shared with passengers (every 5 seconds,
  over a **private** Supabase Realtime Broadcast channel that only the driver and confirmed passengers can join —
  **not stored**; see [privacy-and-consent.md](privacy-and-consent.md)), and the screen is kept awake.
- A **trip bar** on the map shows distance and time left along the route, an off-route warning, arrival, seats
  left, and **End trip**. It stays visible with every panel closed, because the trip runs in the app shell.
- The driver's marker is a navigation arrow that points the way they are heading (GPS heading, or worked out
  from the last two positions).
- A passenger with a confirmed booking automatically follows the driver and sees the same arrow and progress.
- The trip runs until **End trip** is tapped.

Limits: a web app can't track reliably with the phone locked or the browser in the background; the estimated time
scales the route's own estimate rather than reacting to traffic; there is no rerouting.

Code: `src/domains/core/rides/hooks/useLiveTrip.ts`, `src/domains/core/rides/lib/routeProgress.ts`,
`src/domains/core/rides/components/TripBar.tsx`, `src/domains/core/rides/map/MapShellProvider.tsx`.
