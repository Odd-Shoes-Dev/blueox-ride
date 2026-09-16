import { useState, useEffect, useCallback, useRef } from 'react'

interface PlacePrediction {
  place_id: string
  description: string
  structured_formatting: {
    main_text: string
    secondary_text: string
  }
}

interface PlaceDetails {
  name: string
  formatted_address: string
  lat: number
  lng: number
}

interface UsePlacesAutocompleteOptions {
  apiKey: string
  debounceMs?: number
  country?: string
}

export function usePlacesAutocomplete(options: UsePlacesAutocompleteOptions) {
  const { apiKey, debounceMs = 300, country = 'ug' } = options
  const [input, setInput] = useState('')
  const [predictions, setPredictions] = useState<PlacePrediction[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchPredictions = useCallback(async (inputText: string) => {
    if (!inputText || inputText.length < 2) {
      setPredictions([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          inputText
        )}&components=country:${country}&key=${apiKey}`
      )
      const data = await response.json()

      if (data.predictions) {
        setPredictions(data.predictions)
      }
    } catch (error) {
      console.error('Places autocomplete error:', error)
      setPredictions([])
    } finally {
      setLoading(false)
    }
  }, [apiKey, country])

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      fetchPredictions(input)
    }, debounceMs)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [input, fetchPredictions, debounceMs])

  const getPlaceDetails = useCallback(async (placeId: string): Promise<PlaceDetails | null> => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry&key=${apiKey}`
      )
      const data = await response.json()

      if (data.result) {
        return {
          name: data.result.name || data.result.formatted_address,
          formatted_address: data.result.formatted_address,
          lat: data.result.geometry.location.lat,
          lng: data.result.geometry.location.lng,
        }
      }
      return null
    } catch (error) {
      console.error('Place details error:', error)
      return null
    }
  }, [apiKey])

  const clearPredictions = useCallback(() => {
    setPredictions([])
  }, [])

  return {
    input,
    setInput,
    predictions,
    loading,
    getPlaceDetails,
    clearPredictions,
  }
}
