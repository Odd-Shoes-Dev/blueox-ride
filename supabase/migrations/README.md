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
