# Payments switch

Needs migration [`08_payments_switch.sql`](../supabase/migrations/08_payments_switch.sql).

## What it is

One setting in the database decides whether bookings cost money: `app_settings.payments_enabled`.
It is **OFF** for now, so the app can grow before any fee is introduced.

| | Payments **off** (now) | Payments **on** |
|---|---|---|
| Booking | Free once the driver accepts your request | 10% booking fee paid online (Pesapal) once the driver accepts, confirmed once paid |
| Driver's price | Stays as listed; the passenger pays the driver the full price in cash | Passenger pays 10% online, the other 90% in cash |
| Cancelling | No refunds (nothing was paid); seats go back on the ride | Refund rules apply (see the Terms) |
| Church commissions | None accrue | 50% of the fee to the referring church |
| Payment page | Redirects to My Rides | Works as before |

The app, the database rules and the payment function all read this same setting, and the Terms and Privacy
Policy pages change their wording to match.

## Turning payments on (or off) later

In the Supabase SQL Editor:

```sql
-- on
UPDATE public.app_settings SET value = 'true'::jsonb WHERE key = 'payments_enabled';
-- off
UPDATE public.app_settings SET value = 'false'::jsonb WHERE key = 'payments_enabled';
```

Before switching on: finish the Pesapal setup, redeploy the `initiate-payment` function, and tell users
(and partner churches) that fees are starting. Bookings made while free have a fee of 0 and never earn a
church commission, even after payments start.

## How the code follows it

- Client: `usePayments()` in `src/shared/contexts/AppSettingsContext.ts`. If the setting can't be read it
  counts as **off** — nobody is charged because a setting failed to load.
- Database: `_create_booking_from_request()` (a booking request, once the driver accepts it — see
  [booking-requests.md](booking-requests.md); this is now how every driver-posted-ride booking is made),
  `confirm_pending_booking()` (old unpaid bookings), `accept_ride_request()`, `create_church_commission()`.
- The `initiate-payment` edge function refuses to start a charge while payments are off.

## Every place money moves

1. The 10% online booking fee (Pesapal).
2. Refunds when a booking is cancelled.
3. Ride requests (a rider's posted request): the booking created on accept carries the fee.
4. Church commissions, recorded automatically; payouts to churches are done by hand from the admin page.

Drivers are paid in cash by passengers; the app never pays drivers.

## Bookings left unpaid from before

Old bookings still waiting for payment aren't confirmed automatically (they could exceed a ride's seats).
Their owners see **Confirm my seat — free** on the ride page and on My Rides' Bookings tab. A
`pending_payment` booking has never actually held a seat (only a *confirmed* one does — see
[trips-and-seats.md](trips-and-seats.md)), so it can also just be **withdrawn** from My Rides instead,
whatever the ride's departure time — there's nothing to refund and no seat to give back, unlike cancelling an
already-confirmed booking, which stays limited to before departure.
