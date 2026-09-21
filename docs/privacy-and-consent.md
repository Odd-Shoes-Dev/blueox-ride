# Privacy and consent

Needs migrations [`11_consent.sql`](../supabase/migrations/11_consent.sql) and
[`12_private_live_location.sql`](../supabase/migrations/12_private_live_location.sql).

## What it is

Three things that keep people's information handled openly and safely:

1. **A record of agreement.** Every account stores when it agreed to the Terms of Use and Privacy Policy, and
   which version (`users.terms_accepted_at`, `users.terms_version`).
2. **A private live-location channel.** While a driver's trip runs, only the driver and passengers with a
   confirmed booking on that ride can use the channel it is relayed on. The server enforces this.
3. **A notice before sharing.** A driver confirms "Your location will be shared with passengers on this ride until
   you end the trip" every time they tap **Start trip**.

## Who can see whose location

| | Driver | Confirmed passenger | Anyone else |
|---|---|---|---|
| Driver's live position | Own | Yes, while the trip runs | No (refused by the server) |
| A passenger's live position | No | No | No |
| Where a passenger chose to get in/off (a point they picked, not where they are) | Yes | Own only | No |
| A ride's start and end | Yes | Yes | Yes (public) |

The driver's position is relayed live every 5 seconds and is **never stored**. Passenger live sharing is not built
yet — see [future-ideas.md](future-ideas.md).

## Agreement (consent)

- **Email sign-up:** an unticked box ("I am 18 or older and I agree to the Terms of Use and Privacy Policy"). The
  version is sent with the sign-up and the sign-up trigger stores it with the time.
- **Google sign-in, older accounts, and after a material change:** the app shows a one-time **"One last step"**
  screen (`ConsentScreen`) instead of the app until the person ticks the box and continues. It calls the database
  function `accept_terms()`, which takes the time itself. The Terms and Privacy pages stay readable from it.
- **Changing the documents:** `LEGAL.lastUpdated` is the date shown on the pages; `LEGAL.consentVersion` (both in
  `src/domains/core/legal/legalConfig.ts`) is the version people agree to. Change `consentVersion` **only** when
  everyone has to agree again (a material change) — that shows the screen to every signed-in user once more.
- If migration 11 hasn't been run, nobody is asked (the profile has no consent columns), so the app never locks
  people out.

An agreement screen is good practice and evidence of consent, but it doesn't replace legal duties such as
registering with Uganda's Personal Data Protection Office. Registration is an open item to settle with a lawyer.

## Private live-location channel

The channel is named `ride-location-<ride id>`, and ride ids are public, so the name protects nothing. Migration 12
adds rules on `realtime.messages` (function `can_use_ride_location_channel`): only the ride's driver may **send**;
the driver and passengers with a **confirmed** booking may **receive**. The app opens it with
`{ config: { private: true } }` after calling `supabase.realtime.setAuth()`
(`src/shared/services/database/locationRepository.ts`).

- Rules are checked when a channel is **joined**, so a passenger who cancels mid-trip keeps receiving until their
  connection reconnects.
- A passenger is only ever subscribed while their booking is confirmed (`RideDetailsPage`).
- Optional extra hardening: in the Supabase dashboard (Realtime settings) turn off **Allow public access** so *only*
  private channels can be used. Don't do that until the payment-status broadcast channel
  (`paymentsRepository.ts`, dormant while payments are off) is also made private, or it will stop working.

## Do by hand

1. Run migrations **11** then **12** in the Supabase SQL Editor (after 08–10).
2. Run **12 before deploying this version**: without its rules a private channel is refused for everyone, so live
   tracking would stop until it is run.
3. Expect every existing account to see the "One last step" screen once, including your own.

## Code

- Consent: `src/domains/core/legal/ConsentScreen.tsx`, `TermsCheckbox.tsx`, `legalConfig.ts`; gate in
  `src/app/App.tsx` (`AppRoutes`); `needsConsent` / `acceptTerms` in `AuthContext.tsx`; sign-up and `accept_terms`
  calls in `authRepository.ts`.
- Trip notice: the "Share your live location?" dialog in `RideDetailsPage.tsx`.
- Channel: `locationRepository.ts`, migration 12.
