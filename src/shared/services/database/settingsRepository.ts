import { supabase } from './client'

// Whether bookings cost money right now. It is a single switch in the database
// (app_settings.payments_enabled) that the app, the database rules and the payment
// functions all follow. If it can't be read, treat payments as OFF: never charge
// someone because a setting failed to load.
export async function getPaymentsEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'payments_enabled')
    .maybeSingle()

  if (error) throw error
  return data?.value === true
}

// Whether a passenger can share their live location with their driver during a trip. A single
// switch (app_settings.passenger_location_sharing_enabled), off by default — see supabase
// migration 21 and docs/privacy-and-consent.md for why it stays off until the company is
// registered as a data controller, not just as a business. If it can't be read, treat it as OFF:
// never share someone's location because a setting failed to load.
export async function getPassengerLocationSharingEnabled(): Promise<boolean> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'passenger_location_sharing_enabled')
    .maybeSingle()

  if (error) throw error
  return data?.value === true
}
