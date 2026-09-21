# Future ideas

Things we have agreed are worth doing but haven't built. Each has enough detail to pick up later.
When one is built, move its description into a feature page and delete it from here.

---

## 1. Driver counter-offer when refusing a request

**Status:** not started. Wait until the basic [booking requests](booking-requests.md) flow has been used for a while.

**The idea.** When a driver refuses a booking request, they can also suggest a price: *"I'd take UGX 12,000."*
The rider then accepts with **one tap** instead of guessing a higher offer.

**Why.** Today a refused rider has up to two more attempts and has to guess what the driver would accept. A counter-offer
turns a "no" into a near-deal, saves attempts, and keeps the negotiation in the app.

**How it would work.**
- The refusal dialog gets an optional **"Suggest a price"** field, next to the reason (it builds on the refusal reasons
  that already exist — most useful with *offer too low*).
- The rider sees "The driver suggests UGX 12,000 per seat" on the ride page and in the notification, with **Accept**
  and **No thanks**.
- Accepting books them at the driver's price straight away. It should be a single step and should **not use up one of
  their 3 attempts**, since the driver proposed it.
- The counter-offer expires with the original request (or a short time after) so it can't be picked up hours later.

**What it needs.**
- Database: `booking_requests.counter_price INTEGER` (nullable), plus a function `accept_counter_offer(request_id)` that
  creates the booking at that price (reusing `_create_booking_from_request`) and marks the request accepted.
  `respond_to_booking_request` gets an optional counter-price argument on refusal.
- UI: a field in the refuse dialog on `BookingRequestsPage`; a "counter-offer" card in `RequestStatusCard` on the ride page;
  a notification variant in `BookingRequestsProvider`.
- Rules to settle: the counter must be within a sensible band of the listed price; whether the rider can still send a
  different offer instead of accepting; and how it shows in "Answered" for the driver.

---

## 2. Phone push notifications

Booking requests notify only while the app is open. For a driver on the road, add **web push** (needs the PWA service
worker, VAPID keys, and a small server function that sends a push when a request arrives or is answered). Fallback for
phones/browsers without push: a WhatsApp or SMS nudge. iOS only supports web push for installed home-screen apps.

## 3. Route-aware search and detour distance

- Search for rides that **pass near you**, not only ones that start near you: save each ride's route when it is created
  and match a rider's pickup and drop-off against it (pickup before drop-off along the road).
- In the driver's request view, replace straight-line distances with **distance along the route** and how far the
  pickup is **off the route**. `src/domains/core/rides/lib/routeProgress.ts` already snaps a point to a route.

## 4. Seats that free up mid-route

Today a seat is taken for the whole ride. With a pickup and drop-off on each booking (now stored), a seat could be offered
again after its passenger gets off, and shown as "1 seat free from Masaka".

## 5. Ride visibility and sharing

- **Visibility when creating a ride:** *Public* (as now) or *Link only* (not in lists, map or search; anyone with the link
  can open and book). Must be enforced in the database (row-level rules), not just the app. Private/invite-only rides need
  a contacts feature first.
- **Share button** on the ride page and right after creating a ride: the phone's share sheet (WhatsApp etc.) with a ready
  message, or copy-link on desktop. Link previews per ride need a small server-side piece; until then previews are generic.

## 6. Rides that have departed

A ride stays "Active" after its departure time until the driver completes or cancels it. Show it as **Departed** and move
it out of the way (and stop showing it on the map).

## 7. Price guidance for drivers

On Offer a Ride, suggest a price from the route distance (roughly UGX 250–350 per km on long trips, about UGX 5,000
minimum) with a "use suggested" button and a gentle warning far above typical. Show "≈ UGX 320/km" on ride cards as
information only. Check the rates against real fuel prices and fares before relying on them.

## 8. Let drivers add roadside passengers

A one-tap "add a passenger" during a trip (name, phone, seats) for people picked up without booking, so the seat count
and the record stay right without needing them to have an account.

## 9. Tilt and rotate the map

Two-finger tilt/rotate needs a vector map (MapLibre GL with MapTiler vector styles) instead of the current flat Leaflet
tiles. It means rewriting the four places Leaflet is used, and it is heavier on cheap phones. Worth it mainly for a
heading-up view during trips. Start with the landing map and test on a low-end phone.

## 10. Church partner commissions

Commissions only accrue while payments are on. When payments start, tell partner churches, and consider automating
payouts (they are recorded automatically but paid by hand from the admin page).

---

## 11. Passenger live location for the driver

**Status:** designed, not built. Needs the consent work in [privacy-and-consent.md](privacy-and-consent.md) first (done),
and a legal check before switching on. Build it behind an `app_settings` switch (OFF) like the payments one.

**The idea.** When a driver starts a trip, each passenger with a confirmed booking is asked once: *"Allow the driver to
see your location?"* They can say no, and can change their mind any time while the trip runs (a "Sharing with
<driver> — Stop" control on the trip bar and the ride page). The driver then sees a dot for each passenger who chose to
share, with their first name and distance, so roadside pickups are easy.

**Rules.**
- Opt-in, per trip, never automatic; "no" is remembered for that trip and not asked again.
- Only for passengers with a confirmed booking, and only while that ride's trip is running.
- Stops by itself when the driver ticks **Picked up**, when the trip ends, or when the passenger stops it.
- Relayed live over a private channel, never stored.

**Needs.**
- A passenger topic such as `ride-passenger-<ride id>-<user id>`: only that passenger (confirmed booking) may send;
  only the ride's driver (and that passenger) may receive — another rule in `realtime.messages`.
- Knowing a trip has started when the passenger opens the app later: trips aren't stored, only broadcast, so the
  passenger app would listen, in the background, on the private channels of its upcoming confirmed rides and prompt when
  the driver's first update arrives. (With no push notifications, nothing prompts while the app is closed.)
- A driver-side layer on the map and trip bar; the "Sharing" indicator for the passenger; wording in the Privacy
  Policy and the consent screen.
- The passenger's browser also asks for location permission, and the tab must stay open with the screen on, so it is
  most useful in the minutes before pickup.
