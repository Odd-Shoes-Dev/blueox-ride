import { useState, useRef, useEffect, useCallback } from 'react'
import { Input } from '@/shared/ui/input'
import { MapLocationPicker } from './MapLocationPicker'
import { MapPin, Loader2, X, Map, Navigation } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { searchPlaces, reverseGeocode, type PlaceSuggestion } from '@/shared/services/geocoding'

interface Location {
  lat: number
  lng: number
  name: string
}

interface LocationPickerProps {
  value: Location | null
  onChange: (location: Location | null) => void
  placeholder?: string
  markerColor?: 'pickup' | 'dropoff'
  className?: string
}

export function LocationPicker({
  value,
  onChange,
  placeholder = 'Search location',
  markerColor = 'pickup',
  className,
}: LocationPickerProps) {
  const [input, setInput] = useState(value?.name || '')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Get user's current location
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }

    setGettingLocation(true)
    setSuggestions([])
    setShowDropdown(false)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        const name = await reverseGeocode(latitude, longitude).catch(() => 'Current location')
        setInput(name)
        onChange({ lat: latitude, lng: longitude, name })
        setGettingLocation(false)
      },
      (error) => {
        console.error('Geolocation error:', error)
        setGettingLocation(false)
        if (error.code === error.PERMISSION_DENIED) {
          alert('Location access denied. Please enable location permissions.')
        } else {
          alert('Could not get your location. Please try again.')
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  // Update input when value changes externally
  useEffect(() => {
    setInput(value?.name || '')
  }, [value?.name])

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch place suggestions as the user types
  const fetchSuggestions = useCallback(async (searchText: string) => {
    if (!searchText || searchText.length < 3) {
      setSuggestions([])
      return
    }

    setLoading(true)

    try {
      const results = await searchPlaces(searchText)
      setSuggestions(results)
      setShowDropdown(results.length > 0)
    } catch (error) {
      console.error('Place search error:', error)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInput(newValue)

    if (value) {
      onChange(null)
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      fetchSuggestions(newValue)
    }, 400)
  }

  // Handle place selection
  const handleSelectPlace = (result: PlaceSuggestion) => {
    setInput(result.shortName)
    setShowDropdown(false)
    setSuggestions([])

    onChange({
      lat: result.lat,
      lng: result.lng,
      name: result.shortName,
    })
  }

  // Handle map selection
  const handleMapSelect = (location: Location) => {
    setInput(location.name)
    onChange(location)
  }

  // Clear location
  const handleClear = () => {
    setInput('')
    onChange(null)
    setSuggestions([])
  }

  const iconColor = markerColor === 'pickup' ? 'text-coral-500' : 'text-navy-900'

  return (
    <>
      <div ref={containerRef} className={cn('relative', className)}>
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <MapPin className={cn('absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4', iconColor)} />
            <Input
              value={input}
              onChange={handleInputChange}
              onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
              placeholder={placeholder}
              className="pl-10 pr-10"
            />
            {loading && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
            )}
            {!loading && value && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={getCurrentLocation}
            disabled={gettingLocation}
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-md border flex items-center justify-center',
              'bg-background hover:bg-muted transition-colors',
              markerColor === 'pickup' ? 'border-coral-200 text-coral-500' : 'border-navy-200 text-navy-900'
            )}
            title="Use my current location"
          >
            {gettingLocation ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Navigation className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowMapPicker(true)}
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-md border flex items-center justify-center',
              'bg-background hover:bg-muted transition-colors',
              markerColor === 'pickup' ? 'border-coral-200 text-coral-500' : 'border-navy-200 text-navy-900'
            )}
            title="Select on map"
          >
            <Map className="w-4 h-4" />
          </button>
        </div>

        {/* Suggestions dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-60 overflow-auto">
            {suggestions.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => handleSelectPlace(result)}
                className="w-full px-4 py-3 text-left hover:bg-muted transition-colors border-b last:border-b-0"
              >
                <p className="font-medium text-sm truncate">
                  {result.shortName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {result.secondaryText}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map Picker Modal */}
      <MapLocationPicker
        isOpen={showMapPicker}
        onClose={() => setShowMapPicker(false)}
        onSelect={handleMapSelect}
        initialLocation={value}
        title={markerColor === 'pickup' ? 'Select Pickup Location' : 'Select Drop-off Location'}
        markerColor={markerColor}
      />
    </>
  )
}
