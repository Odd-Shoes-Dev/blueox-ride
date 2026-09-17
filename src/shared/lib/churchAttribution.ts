// Pure localStorage mechanics for church referral attribution — no React, no
// Supabase. Lives in shared/ (not domains/church/) specifically so core code
// (e.g. the booking flow) can read the stored attribution without importing
// anything from the church domain. The church domain owns *setting* this
// (which requires a church lookup); core only ever reads it.

export interface ChurchAttribution {
  churchId: string
  churchSlug: string
  churchName: string
  timestamp: number
}

const STORAGE_KEY = 'blueox_church_attribution'
const EXPIRY_DAYS = 30

function isExpired(attribution: ChurchAttribution): boolean {
  const expiryTime = attribution.timestamp + EXPIRY_DAYS * 24 * 60 * 60 * 1000
  return Date.now() >= expiryTime
}

export function readChurchAttribution(): ChurchAttribution | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return null

  try {
    const parsed: ChurchAttribution = JSON.parse(stored)
    if (isExpired(parsed)) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function writeChurchAttribution(attribution: ChurchAttribution): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution))
}

export function clearChurchAttribution(): void {
  localStorage.removeItem(STORAGE_KEY)
}

// Convenience used by core's booking flow, which only needs the id and
// shouldn't need to know the attribution shape.
export function getStoredChurchId(): string | null {
  return readChurchAttribution()?.churchId ?? null
}
