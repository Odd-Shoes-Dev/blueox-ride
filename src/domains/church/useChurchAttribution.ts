import { useState, useEffect, useCallback } from 'react'
import { churchRepository } from '@/shared/services/database'
import {
  readChurchAttribution,
  writeChurchAttribution,
  clearChurchAttribution,
  getStoredChurchId,
  type ChurchAttribution,
} from '@/shared/lib/churchAttribution'

export { getStoredChurchId }

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
    setAttribution(readChurchAttribution())
    setLoading(false)
  }, [])

  /**
   * Set church attribution when user visits a church page
   * Fetches church details from database and stores in localStorage
   */
  const setChurchAttribution = useCallback(async (churchSlug: string): Promise<boolean> => {
    try {
      const church = await churchRepository.getChurchBySlug(churchSlug)

      if (!church) {
        console.log('Church not found or inactive:', churchSlug)
        return false
      }

      const newAttribution: ChurchAttribution = {
        churchId: church.id,
        churchSlug: church.slug,
        churchName: church.name,
        timestamp: Date.now(),
      }

      writeChurchAttribution(newAttribution)
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
    return getStoredChurchId()
  }, [attribution])

  /**
   * Clear church attribution
   * Call this if you want to manually clear the attribution
   */
  const clearAttribution = useCallback(() => {
    clearChurchAttribution()
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
