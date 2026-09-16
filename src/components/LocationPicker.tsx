import { useState, useRef, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { MapLocationPicker } from './MapLocationPicker'
import { MapPin, Loader2, X, Map, Navigation } from 'lucide-react'
import { cn } from '@/lib/utils'

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

interface NominatimResult {
  place_id: number
  display_name: string
  lat: string
  lon: string
  address?: {
    road?: string
    suburb?: string
    city?: string
    town?: string
    village?: string
    state?: string
    country?: string
  }
}

export function LocationPicker({
  value,
  onChange,
  placeholder = 'Search location',
  markerColor = 'pickup',
  className,
}: LocationPickerProps) {
  const [input, setInput] = useState(value?.name || '')
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reverse geocode for current location
  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      )
      if (!response.ok) throw new Error('Reverse geocoding failed')
      const data = await response.json()

      if (data.address) {
        const parts: string[] = []
        if (data.address.road) parts.push(data.address.road)
        if (data.address.suburb) parts.push(data.address.suburb)
        const city = data.address.city || data.address.town || data.address.village
        if (city) parts.push(city)
        if (parts.length > 0) return parts.join(', ')
      }
      return data.display_name?.split(',').slice(0, 2).join(',') || 'Current location'
    } catch {
      return 'Current location'
    }
  }

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
        const name = await reverseGeocode(latitude, longitude)
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

  // Fetch suggestions using Nominatim (OpenStreetMap)
  const fetchSuggestions = useCallback(async (searchText: string) => {
    if (!searchText || searchText.length < 3) {
      setSuggestions([])
      return
    }

    setLoading(true)

    try {
      // Use Nominatim API - free OpenStreetMap geocoding
      const encodedQuery = encodeURIComponent(searchText)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodedQuery}&countrycodes=ug&limit=5&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'en',
          },
        }
      )

      if (!response.ok) {
        throw new Error('Nominatim API error')
      }

      const results: NominatimResult[] = await response.json()

      setSuggestions(results)
      setShowDropdown(results.length > 0)
    } catch (error) {
      console.error('Nominatim error:', error)
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

  // Get a shorter display name from the result
  const getShortName = (result: NominatimResult): string => {
    const parts: string[] = []
    if (result.address) {
      if (result.address.road) parts.push(result.address.road)
      if (result.address.suburb) parts.push(result.address.suburb)
      const city = result.address.city || result.address.town || result.address.village
      if (city) parts.push(city)
    }
    return parts.length > 0 ? parts.join(', ') : result.display_name.split(',').slice(0, 2).join(',')
  }

  // Get secondary text (region/country)
  const getSecondaryText = (result: NominatimResult): string => {
    if (result.address) {
      const parts: string[] = []
      if (result.address.state) parts.push(result.address.state)
      if (result.address.country) parts.push(result.address.country)
      return parts.join(', ')
    }
    return result.display_name.split(',').slice(2).join(',').trim()
  }

  // Handle place selection
  const handleSelectPlace = (result: NominatimResult) => {
    const shortName = getShortName(result)
    setInput(shortName)
    setShowDropdown(false)
    setSuggestions([])

    onChange({
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      name: shortName,
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
                key={result.place_id}
                type="button"
                onClick={() => handleSelectPlace(result)}
                className="w-full px-4 py-3 text-left hover:bg-muted transition-colors border-b last:border-b-0"
              >
                <p className="font-medium text-sm truncate">
                  {getShortName(result)}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {getSecondaryText(result)}
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
