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
