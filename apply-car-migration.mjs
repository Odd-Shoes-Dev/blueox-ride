#!/usr/bin/env node
// Apply car details migration to Supabase
// Run with: node apply-car-migration.mjs

import { readFileSync } from 'fs'

const SUPABASE_URL = 'https://zwuoewhxqndmutbfyzka.supabase.co'

// Read service role key from environment or prompt user
const SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('❌ Error: SUPABASE_SECRET_KEY environment variable not set')
  console.error('\nPlease run this migration manually:')
  console.error('1. Go to: https://supabase.com/dashboard/project/zwuoewhxqndmutbfyzka/sql/new')
  console.error('2. Copy the contents of: supabase/add-car-details-migration.sql')
  console.error('3. Paste and click "Run"')
  console.error('\nSee apply-migration.md for detailed instructions.')
  process.exit(1)
}

async function runMigration() {
  try {
    console.log('📖 Reading migration file...')
    const sql = readFileSync('./supabase/add-car-details-migration.sql', 'utf8')

    console.log('🚀 Applying migration to Supabase...')

    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ query: sql })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`HTTP ${response.status}: ${error}`)
    }

    console.log('✅ Migration applied successfully!')
    console.log('\nAdded columns to rides table:')
    console.log('  • car_brand (TEXT)')
    console.log('  • car_model (TEXT)')
    console.log('  • car_year (INTEGER)')
    console.log('\n🎉 Your app is now ready to store car details!')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error('\nPlease run the migration manually through the Supabase Dashboard:')
    console.error('See apply-migration.md for instructions.')
    process.exit(1)
  }
}

runMigration()
