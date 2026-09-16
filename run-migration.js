// Run Car Details Migration
// This script applies the car details migration to the Supabase database

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Read environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing VITE_SUPABASE_URL or SUPABASE_SECRET_KEY environment variables')
  console.error('Please set SUPABASE_SECRET_KEY in your .env file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  try {
    console.log('Reading migration file...')
    const migrationSQL = readFileSync(
      join(__dirname, 'supabase', 'add-car-details-migration.sql'),
      'utf8'
    )

    console.log('Running migration on Supabase...')

    // Split SQL by statements and run each one
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    for (const statement of statements) {
      if (statement) {
        console.log(`Executing: ${statement.substring(0, 60)}...`)
        const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' })

        if (error) {
          console.error('Error executing statement:', error)
          throw error
        }
      }
    }

    console.log('✅ Migration completed successfully!')
    console.log('\nThe following columns have been added to the rides table:')
    console.log('  - car_brand (TEXT)')
    console.log('  - car_model (TEXT)')
    console.log('  - car_year (INTEGER)')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

runMigration()
