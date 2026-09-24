import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { settingsRepository } from '@/shared/services/database'
import { AppSettingsContext, type AppSettings } from '@/shared/contexts/AppSettingsContext'

const DEFAULT_SETTINGS: AppSettings = {
  paymentsEnabled: false,
  passengerLocationSharingEnabled: false,
  loading: true,
}

// Loads app-wide settings once when the app starts.
export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      settingsRepository.getPaymentsEnabled().catch((error) => {
        console.error('Could not load payments setting:', error)
        return false
      }),
      settingsRepository.getPassengerLocationSharingEnabled().catch((error) => {
        console.error('Could not load passenger location sharing setting:', error)
        return false
      }),
    ]).then(([paymentsEnabled, passengerLocationSharingEnabled]) => {
      if (!cancelled) setSettings({ paymentsEnabled, passengerLocationSharingEnabled, loading: false })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(() => settings, [settings])
  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>
}
