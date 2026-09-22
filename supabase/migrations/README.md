# Database Migrations

Run these files **in order** against your Supabase project, via **Dashboard → SQL Editor** (paste contents, click Run) or the Supabase CLI (`supabase db execute --file <path>`).

There is no automated migration runner in this project — apply each file manually, in sequence, once per environment (local/staging/production).

| Step | File | What it does |
|------|------|--------------|
| 01 | `01_schema.sql` | Base schema: users, rides, bookings, payments, reviews tables, triggers, RLS policies, views. Run this first on a fresh database. |
| 02 | `02_fix_user_insert_policy.sql` | Allows a user to self-insert their profile row if the signup trigger didn't fire, plus re-creates the trigger defensively. |
| 03 | `03_storage_policies.sql` | RLS policies for the `avatars` storage bucket. Assumes the bucket already exists (create it manually in Dashboard → Storage first if needed). |
| 04 | `04_car_photos_migration.sql` | Adds the `car_photos` table + bucket + policies, and links a primary car photo to a ride. |
| 05 | `05_add_car_details_migration.sql` | Adds `car_brand`/`car_model`/`car_year` columns to `rides` and refreshes the `rides_with_driver` view. |
| 06 | `06_church_commissions.sql` | Adds `churches` and `church_commissions` tables, seeds initial church rows, and wires up commission-tracking triggers. |
| 07 | `07_ride_requests.sql` | Adds `ride_requests` table (passenger-posted demand with a budget) and the `accept_ride_request()` function a driver calls to atomically create a matching ride + booking. |
| 08 | `08_payments_switch.sql` | Adds the `payments_enabled` setting (OFF by default: bookings are free and confirmed instantly, no fee, no church commission) plus the `book_ride()` and `confirm_pending_booking()` functions. Flip the setting with one UPDATE to bring payments back. |
| 09 | `09_seat_controls.sql` | Driver seat controls: adjust seats left by hand, tick a passenger as picked up, mark a no-show (frees the seat). Also keeps a ride's Active/Full status in step with its seats, and stops a cancelled booking from re-opening a ride the driver cancelled. |
| 10 | `10_booking_requests.sql` | Booking requests: `booking_requests` table (realtime), pickup/drop-off/agreed price on bookings, and the `request_booking()`, `withdraw_booking_request()` and `respond_to_booking_request()` functions with the attempt limits. See `docs/booking-requests.md`. |
| 11 | `11_consent.sql` | Records when each user agreed to the Terms/Privacy Policy and which version (`users.terms_accepted_at`, `terms_version`), stores it from the sign-up trigger, and adds `accept_terms()` for the one-time consent screen. See `docs/privacy-and-consent.md`. |
| 12 | `12_private_live_location.sql` | Makes the live driver-location channel private: only the ride's driver can send, only the driver and confirmed passengers can listen (rules on `realtime.messages`). **Run before deploying the matching app version.** |
| 13 | `13_ride_editing.sql` | Lets a driver edit their own ride (route, date/time, price, seats, notes, car details) via a new Edit Ride page, but locks route/date/time/price/seats once the ride has a booking or an adjusted seat (`guard_ride_edit` trigger). Notes and car details always stay editable. See `docs/ride-editing.md`. |
| 14 | `14_ride_request_visibility.sql` | Restricts browsing open ride requests to signed-in users (it had no such check before). See `docs/ride-requests.md`. |
| 15 | `15_always_ask_driver.sql` | Removes the instant-booking path entirely: every booking on a driver-posted ride now goes through the driver as a request (revokes `book_ride()`'s grant), raises the per-ride attempt limit from 3 to 4, and a request now expires at the ride's departure time instead of a fixed 2 hours. See `docs/booking-requests.md`. |

## Verifying a step worked

After running a step, a quick sanity check in the SQL Editor, e.g. for step 05:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'rides'
AND column_name IN ('car_brand', 'car_model', 'car_year');
```

## Adding a new migration later

Name the next file `08_<short_description>.sql`, add a row to the table above, and note any dependency on earlier steps in its header comment (see existing files for the pattern).
