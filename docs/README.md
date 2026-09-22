# Blue OX Rides — documentation

Where we write down how the app works and what we plan to build. Keep these short and current:
when a feature changes, update its page in the same change.

## Index

| Page | What it covers |
|------|----------------|
| [booking-requests.md](booking-requests.md) | Asking a driver for a seat with your own pickup, drop-off and offer: rules, database, screens |
| [ride-requests.md](ride-requests.md) | A rider posting "I need a ride" for any driver to accept: who can see them, map pins |
| [payments-switch.md](payments-switch.md) | Payments are OFF (free bookings): what that means, and how to turn them on later |
| [trips-and-seats.md](trips-and-seats.md) | Live trip mode, and how drivers keep the seat count true (seats, "picked up", no-shows) |
| [ride-editing.md](ride-editing.md) | Editing a posted ride (locks once it has a booking), and cancelling |
| [privacy-and-consent.md](privacy-and-consent.md) | Agreeing to the Terms/Privacy Policy (recorded), who can see whose location, the private live-location channel |
| [map-shell.md](map-shell.md) | How the app is built around one persistent map with panels on top |
| [future-ideas.md](future-ideas.md) | Ideas we have agreed on but not built yet, with enough detail to pick them up later |

Database changes are in [`supabase/migrations`](../supabase/migrations/README.md), run in order by hand
in the Supabase SQL Editor. Each feature page says which migration it needs.

## Writing a page

- Start with **what it is and why**, then **how it works**, then **where the code lives**.
- Say what the **rules** are in plain words (limits, who can do what), and where they are enforced.
- Note anything the reader has to **do by hand** (a migration to run, a setting to change).
- Ideas that aren't built yet go in [future-ideas.md](future-ideas.md), not in a feature page.
- Link to code by path (`src/...`) rather than pasting it, so the page doesn't go stale.

## A note on money

While payments are off (see [payments-switch.md](payments-switch.md)) nothing is charged: booking is free
and the passenger pays the driver in cash. Any feature page that mentions a fee describes what happens
once payments are switched on.
