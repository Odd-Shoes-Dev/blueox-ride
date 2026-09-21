import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { settingsRepository } from '@/shared/services/database'
import { AppSettingsContext, type AppSettings } from '@/shared/contexts/AppSettingsContext'

// Loads app-wide settings once when the app starts.
export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>({ paymentsEnabled: false, loading: true })

  useEffect(() => {
    let cancelled = false
    settingsRepository
      .getPaymentsEnabled()
      .then((paymentsEnabled) => {
        if (!cancelled) setSettings({ paymentsEnabled, loading: false })
      })
      .catch((error) => {
        // Can't tell — stay on the safe side (free) rather than showing fees that might not apply.
        console.error('Could not load app settings:', error)
        if (!cancelled) setSettings({ paymentsEnabled: false, loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(() => settings, [settings])
  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>
}
