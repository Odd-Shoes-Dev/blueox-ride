import { createContext, useContext } from 'react'

export interface AppSettings {
  // Do bookings cost money right now? false = free: no booking fee, the driver is paid
  // their full price in cash. Follows the database setting (see supabase migration 08).
  paymentsEnabled: boolean
  // Can a passenger share their live location with their driver during a trip? Off until the
  // company is registered as a data controller, not just as a business (see supabase migration
  // 21 and docs/privacy-and-consent.md).
  passengerLocationSharingEnabled: boolean
  loading: boolean
}

// Until settings have loaded (or if they can't be read) everything counts as OFF.
export const AppSettingsContext = createContext<AppSettings>({
  paymentsEnabled: false,
  passengerLocationSharingEnabled: false,
  loading: true,
})

// Name is a holdover from when this only held the payments switch — it now returns every
// app-wide setting. Left as-is rather than renamed across its ~10 call sites for one more field.
export function usePayments(): AppSettings {
  return useContext(AppSettingsContext)
}
