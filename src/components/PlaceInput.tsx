import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { MapPin, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PlaceInputProps {
  value: string
  onChange: (value: string, lat?: number, lng?: number) => void
  placeholder?: string
  className?: string
  markerColor?: 'green' | 'red'
}

interface Prediction {
  place_id: string
  description: string
  structured_formatting?: {
    main_text: string
    secondary_text: string
  }
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

export function PlaceInput({
  value,
  onChange,
  placeholder = 'Enter location',
  className,
  markerColor = 'green',
}: PlaceInputProps) {
  const [input, setInput] = useState(value)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setInput(value)
  }, [value])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchPredictions = async (searchText: string) => {
    if (!searchText || searchText.length < 2 || !GOOGLE_MAPS_API_KEY) {
      setPredictions([])
      return
    }

    setLoading(true)
    try {
      // Use proxy or server-side endpoint in production
      // For now, we'll use a simple approach
      const encodedInput = encodeURIComponent(searchText)
      const url = `https://corsproxy.io/?${encodeURIComponent(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodedInput}&components=country:ug&key=${GOOGLE_MAPS_API_KEY}`
      )}`

      const response = await fetch(url)
      const data = await response.json()

      if (data.predictions) {
        setPredictions(data.predictions)
        setShowDropdown(true)
      }
    } catch (error) {
      console.error('Places autocomplete error:', error)
      // Fallback: use input as manual entry
      setPredictions([])
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInput(newValue)
    onChange(newValue) // Clear coordinates when typing

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      fetchPredictions(newValue)
    }, 300)
  }

  const handleSelectPlace = async (prediction: Prediction) => {
    setInput(prediction.description)
    setShowDropdown(false)
    setPredictions([])

    // Get place details for coordinates
    try {
      const url = `https://corsproxy.io/?${encodeURIComponent(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${prediction.place_id}&fields=geometry,name&key=${GOOGLE_MAPS_API_KEY}`
      )}`

      const response = await fetch(url)
      const data = await response.json()

      if (data.result?.geometry?.location) {
        const { lat, lng } = data.result.geometry.location
        onChange(prediction.description, lat, lng)
      } else {
        onChange(prediction.description)
      }
    } catch (error) {
      console.error('Place details error:', error)
      onChange(prediction.description)
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <MapPin
          className={cn(
            'absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4',
            markerColor === 'green' ? 'text-coral-500' : 'text-destructive'
          )}
        />
        <Input
          value={input}
          onChange={handleInputChange}
          onFocus={() => predictions.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className="pl-10 pr-10"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && predictions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-60 overflow-auto">
          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              type="button"
              onClick={() => handleSelectPlace(prediction)}
              className="w-full px-4 py-3 text-left hover:bg-muted transition-colors border-b last:border-b-0"
            >
              <p className="font-medium text-sm truncate">
                {prediction.structured_formatting?.main_text || prediction.description}
              </p>
              {prediction.structured_formatting?.secondary_text && (
                <p className="text-xs text-muted-foreground truncate">
                  {prediction.structured_formatting.secondary_text}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
