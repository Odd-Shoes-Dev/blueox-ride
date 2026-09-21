import { createContext, useContext } from 'react'

export interface AppSettings {
  // Do bookings cost money right now? false = free: no booking fee, the driver is paid
  // their full price in cash. Follows the database setting (see supabase migration 08).
  paymentsEnabled: boolean
  loading: boolean
}

// Until the setting has loaded (or if it can't be read) payments count as OFF.
export const AppSettingsContext = createContext<AppSettings>({ paymentsEnabled: false, loading: true })

export function usePayments(): AppSettings {
  return useContext(AppSettingsContext)
}
