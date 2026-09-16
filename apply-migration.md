# Apply Car Details Migration

The migration file `supabase/add-car-details-migration.sql` adds car brand, model, and year columns to the rides table.

## Option 1: Supabase Dashboard (Recommended - Easiest)

1. Go to https://supabase.com/dashboard/project/zwuoewhxqndmutbfyzka/sql/new
2. Copy the contents of `supabase/add-car-details-migration.sql`
3. Paste into the SQL Editor
4. Click "Run" to execute the migration

## Option 2: Using Supabase CLI

```bash
# If you have the Supabase CLI installed
npx supabase db execute --file supabase/add-car-details-migration.sql
```

## What This Migration Does

Adds three new optional columns to the `rides` table:
- `car_brand` (TEXT) - e.g., "Toyota"
- `car_model` (TEXT) - e.g., "Corolla"
- `car_year` (INTEGER) - e.g., 2022

These columns are already being used by the frontend to help passengers identify the driver's car.

## Verification

After running the migration, you can verify it worked by running this query in the SQL Editor:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'rides'
AND column_name IN ('car_brand', 'car_model', 'car_year');
```

You should see all three columns listed.
