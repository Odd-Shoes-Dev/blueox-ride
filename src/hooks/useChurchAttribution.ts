import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const CHURCH_ATTRIBUTION_KEY = 'blueox_church_attribution'
const ATTRIBUTION_EXPIRY_DAYS = 30 // Attribution lasts 30 days

interface ChurchAttribution {
  churchId: string
  churchSlug: string
  churchName: string
  timestamp: number
}

/**
 * Hook for managing church attribution tracking
 *
 * When a user visits a church-specific URL (e.g., /watoto), we store
 * the church attribution in localStorage. This attribution is then
 * used when the user books a ride to credit the church.
 */
export function useChurchAttribution() {
  const [attribution, setAttribution] = useState<ChurchAttribution | null>(null)
  const [loading, setLoading] = useState(true)

  // Load attribution from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(CHURCH_ATTRIBUTION_KEY)
    if (stored) {
      try {
        const parsed: ChurchAttribution = JSON.parse(stored)
        // Check if attribution has expired
        const expiryTime = parsed.timestamp + (ATTRIBUTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
        if (Date.now() < expiryTime) {
          setAttribution(parsed)
        } else {
          // Attribution expired, clear it
          localStorage.removeItem(CHURCH_ATTRIBUTION_KEY)
        }
      } catch {
        localStorage.removeItem(CHURCH_ATTRIBUTION_KEY)
      }
    }
    setLoading(false)
  }, [])

  /**
   * Set church attribution when user visits a church page
   * Fetches church details from database and stores in localStorage
   */
  const setChurchAttribution = useCallback(async (churchSlug: string): Promise<boolean> => {
    try {
      // Fetch church from database
      const { data: church, error } = await supabase
        .from('churches')
        .select('id, slug, name')
        .eq('slug', churchSlug.toLowerCase())
        .eq('is_active', true)
        .single()

      if (error || !church) {
        console.log('Church not found or inactive:', churchSlug)
        return false
      }

      const newAttribution: ChurchAttribution = {
        churchId: church.id,
        churchSlug: church.slug,
        churchName: church.name,
        timestamp: Date.now(),
      }

      localStorage.setItem(CHURCH_ATTRIBUTION_KEY, JSON.stringify(newAttribution))
      setAttribution(newAttribution)
      return true
    } catch (err) {
      console.error('Error setting church attribution:', err)
      return false
    }
  }, [])

  /**
   * Get the church ID for use in booking
   * Returns null if no valid attribution exists
   */
  const getChurchIdForBooking = useCallback((): string | null => {
    if (!attribution) return null

    // Double-check expiry
    const expiryTime = attribution.timestamp + (ATTRIBUTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    if (Date.now() >= expiryTime) {
      localStorage.removeItem(CHURCH_ATTRIBUTION_KEY)
      setAttribution(null)
      return null
    }

    return attribution.churchId
  }, [attribution])

  /**
   * Clear church attribution
   * Call this if you want to manually clear the attribution
   */
  const clearAttribution = useCallback(() => {
    localStorage.removeItem(CHURCH_ATTRIBUTION_KEY)
    setAttribution(null)
  }, [])

  return {
    attribution,
    loading,
    setChurchAttribution,
    getChurchIdForBooking,
    clearAttribution,
    hasAttribution: !!attribution,
  }
}

/**
 * Utility function to get church ID synchronously
 * Use this in booking functions where you can't use hooks
 */
export function getStoredChurchId(): string | null {
  const stored = localStorage.getItem(CHURCH_ATTRIBUTION_KEY)
  if (!stored) return null

  try {
    const parsed: ChurchAttribution = JSON.parse(stored)
    const expiryTime = parsed.timestamp + (ATTRIBUTION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    if (Date.now() < expiryTime) {
      return parsed.churchId
    }
    localStorage.removeItem(CHURCH_ATTRIBUTION_KEY)
    return null
  } catch {
    return null
  }
}
