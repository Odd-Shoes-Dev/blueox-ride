# Passenger live location sharing

Needs migration [`21_passenger_location_sharing.sql`](../supabase/migrations/21_passenger_location_sharing.sql).

**Off by default**, and deliberately left off — see [privacy-and-consent.md](privacy-and-consent.md). This is the
most sensitive kind of data this app handles, and switching it on for real users is a decision that stays with the
project owner, not something this feature being "built" implies. It's fully wired, tested by build, and ready to
turn on the moment the company is registered as a **data controller** with Uganda's Personal Data Protection
Office — being registered as a business (URSB) is a separate thing and does not cover this.

```sql
-- on
UPDATE public.app_settings SET value = 'true'::jsonb WHERE key = 'passenger_location_sharing_enabled';
-- off
UPDATE public.app_settings SET value = 'false'::jsonb WHERE key = 'passenger_location_sharing_enabled';
```

**While the switch is off, the share-request prompt itself never fires — for anyone, ever, no matter how many
trips are started.** `usePassengerLocationSharing`'s background listener (the thing that watches for a driver's
first location update, which is what triggers the ask) checks the switch before doing anything else and returns
immediately if it's off, so a passenger's app never even subscribes to find out a trip has started. This isn't a
UI-only precaution — nothing about starting a trip reaches this feature at all while it's off.

### Why it stays off: consent doesn't substitute for registration

Checked directly against the Data Protection and Privacy Act, 2019 and a real 2025 enforcement case: **registering
with the PDPO and getting a user's consent are two separate legal requirements, and having one does not excuse
the other.** Section 29 of the Act (and Regulation 15(1) of the 2021 Regulations) requires *every* data
collector, processor or controller — in Uganda or elsewhere, if it's Ugandans' data — to register, with no
small-business exemption. Uganda's own regulator ruled on this exact question in 2025, finding **Google** in
breach for not registering locally, despite Google's data collection already running on user consent worldwide.
The PDPO's finding: *"Registration was mandated as a separate legal requirement independent of consent
considerations. User consent alone was insufficient to satisfy Uganda's data protection framework."* If Google's
consent wasn't enough, a passenger tapping "yes" in this app isn't either.

### Registering with the PDPO, when ready

Entirely online, via `pdpo.go.ug`:

1. Create a portal account with a corporate email.
2. Fill in the organisation profile (legal name, registration number, address, sector, who's responsible for data
   protection).
3. Choose the category — **Data Controller**, for this app.
4. Fill in the application: what personal data is collected (names, phone numbers, location, ...), why, how long
   it's kept, who it's shared with, any transfers outside Uganda.
5. Upload documents (below) and pay the fee.
6. PDPO reviews it — a few weeks, based on two independent sources.
7. Certificate issued once approved.

**Documents needed:** certificate of incorporation (the URSB registration), national ID or passport of whoever's
responsible for data protection at the company, tax registration details, a written description of what's
collected and why (essentially the Privacy Policy, formalised), and proof of payment.

**Fee and renewal:** UGX 100,000 (~$30) to register, valid **one year**, renew starting three months before it
expires. An annual compliance report is then due within 90 days of the company's financial year ending. No
small-business tier — the process is the same regardless of company size.

Worth confirming the exact current fee and form requirements directly on the portal before starting, and treating
all of the above as a starting point rather than legal advice — get this confirmed by a lawyer before relying on
it.

## What it is

The reverse direction of [driver live-location sharing](trips-and-seats.md#live-trip-mode): while a driver's trip
is running, a passenger with a confirmed seat can share their own position back, so the driver can find them at a
roadside pickup.

## How it's triggered — automatically, not a button either side has to press

A driver already starts sharing the moment they tap **Start trip** — that's the same event this reuses as the
signal a trip has begun, rather than adding a second thing for the driver to do:

1. Each passenger's own app, while it's open, quietly watches the driver-location channel of every ride they have
   an **upcoming confirmed booking** on (background listener, not tied to any one screen).
2. The instant the driver's **first** live update arrives on one of those, the passenger is asked, once: *"Share
   your live location? [driver] just started this trip…"* — **Share my location** / **No thanks**.
3. Saying yes starts sharing immediately; saying no is remembered for that ride and never asked again.

This only works while the passenger's app is open at that moment — there's no push notification yet (see
[future-ideas.md](future-ideas.md)), so someone who isn't looking at the app when the trip starts is never asked.

## Stopping

Whichever comes first:
- The driver ticks **Picked up** for that passenger.
- The driver taps **End trip**.
- The passenger stops it themselves — a small "Sharing your location with the driver — Stop" line on their own
  trip bar.

Nothing is ever stored — relayed live the same way the driver's own position is, and gone the moment sharing
stops.

## How the driver sees it

Each sharing passenger appears on the map as a small avatar marker — the same initials-on-a-circle style used
elsewhere in the app (My Rides' passenger list, the corner account button), not a new visual language, and not a
per-passenger color (the app's pin colors already mean specific things — green pickup, navy the driver's own,
amber an open request — and stacking a fourth meaning on top would clash). Tapping one shows their name in a
popup; nothing is shown as a permanent label, the same way ride pins already work.

A passenger who never opted in — or hasn't answered yet — just never has a marker. There's no separate "did they
say yes" signal to check anywhere: silence on their channel *is* the answer, the same pattern the driver's own
sharing already uses.

## Data and channels

One **private** Realtime Broadcast channel per (ride, passenger) pair — `ride-passenger-<ride id>-<passenger
id>` — not one shared per ride, so a passenger's position is never visible to any other passenger, only to the
ride's driver and to themselves. Enforced in the database (`can_use_passenger_location_channel`,
`realtime.messages` policies, migration 21), the same model as the driver's own channel
([privacy-and-consent.md](privacy-and-consent.md)) — checked server-side, not just left to the app to behave.

Auto-stopping on "Picked up" needs `bookings` on the Realtime publication (`postgres_changes`, a different
mechanism from the broadcast channels above — an actual row update, not a relayed message), added in the same
migration.

## Code

- `src/domains/core/rides/hooks/usePassengerLocationSharing.ts` — the passenger-side background listener, the
  prompt, and the share itself. Runs inside `MapShellProvider`, not any one screen.
- `src/domains/core/rides/hooks/useLiveTrip.ts` — `passengerPositions`, the driver side: subscribes to every
  confirmed passenger once a trip starts.
- `src/domains/core/rides/components/TripBar.tsx` — the passenger's own "Stop" control.
- `src/app/MapShell.tsx` — the share prompt (not tied to any screen), and passes `passengerPositions` to the map.
- `src/domains/core/rides/components/HeroLiveMap.tsx` — the avatar markers (`makePassengerIcon`).
- `src/shared/services/database/locationRepository.ts` — `createPassengerLocationBroadcaster`,
  `subscribeToPassengerLocation`.
- `src/shared/services/database/bookingsRepository.ts` — `subscribeToBookingPickedUp` (the auto-stop signal).
- `src/shared/contexts/AppSettingsContext.ts` — `passengerLocationSharingEnabled`, same switch pattern as
  `paymentsEnabled`.

## Known limits

- Only works while the passenger's app is open at the moment the driver starts — no push notification yet.
- A passenger confirmed **after** the driver has already started their trip won't get a listener until the next
  trip — seats close once a trip starts in practice, so this is a narrow edge case, not something actively
  guarded against.
- The map marker shows where someone is, not who else is nearby them or any route to reach them — it's a dot to
  aim for, not turn-by-turn.
