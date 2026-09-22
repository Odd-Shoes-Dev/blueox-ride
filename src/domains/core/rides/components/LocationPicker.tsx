import { useState, useRef, useEffect, useCallback } from 'react'
import { Input } from '@/shared/ui/input'
import { MapLocationPicker } from './MapLocationPicker'
import { MapPin, Loader2, X, Map, Navigation } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { searchPlaces, reverseGeocode, type PlaceSuggestion } from '@/shared/services/geocoding'
import { useOptionalMapShell } from '@/domains/core/rides/map/MapShellContext'

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
  // Semi-transparent white styling for use on top of a map/image (e.g. the landing hero).
  // Fixed light look with dark text regardless of app theme, since the
  // backdrop behind it is the map, not the themed page background.
  glass?: boolean
  // When provided, the "select on map" button hands off to the caller (which
  // places the pin on its own map, e.g. the landing hero) instead of opening
  // the full-screen picker modal.
  onPickOnMap?: () => void
}

const glassInput = 'bg-white/80 border-white/60 text-navy-900 placeholder:text-navy-900/60'
const glassButton = 'bg-white/80 hover:bg-white/90 border-white/60'
// Suggestions are a list of text that has to stay readable over the map, so keep this one denser.
const glassDropdown = 'bg-white/85 border-white/60'

export function LocationPicker({
  value,
  onChange,
  placeholder = 'Search location',
  markerColor = 'pickup',
  className,
  glass = false,
  onPickOnMap,
}: LocationPickerProps) {
  const shell = useOptionalMapShell()
  const [input, setInput] = useState(value?.name || '')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)
  // Set on blur so a typed-but-not-picked address (see handleKeyDown) gets a hint instead of
  // silently failing later at submit — but not while still typing, or it'd nag every keystroke.
  const [blurred, setBlurred] = useState(false)
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
    setBlurred(false)

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

  // This field sits inside a form with a submit button, so pressing Enter after typing (rather
  // than tapping a suggestion) would otherwise submit the whole form with this field looking
  // filled in but not actually holding a location — the exact "I picked it but it says missing"
  // report this fixes. Enter here always picks the top suggestion instead, never submits.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (suggestions.length > 0) handleSelectPlace(suggestions[0])
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

  // "Select on map": use the caller's own handler if given; otherwise, inside the
  // app's shared-map layout, place the pin on that map; otherwise fall back to
  // the full-screen picker modal (standalone pages).
  const handlePickOnMap = async () => {
    if (onPickOnMap) return onPickOnMap()
    if (shell) {
      const point = await shell.requestPin(markerColor, value)
      if (point) {
        setInput(point.name)
        onChange(point)
      }
      return
    }
    setShowMapPicker(true)
  }

  // Clear location
  const handleClear = () => {
    setInput('')
    onChange(null)
    setSuggestions([])
  }

  // Matches the pin colours on the map (green pickup, navy destination).
  const iconColor = markerColor === 'pickup' ? 'text-green-600' : 'text-navy-900'

  return (
    <>
      <div ref={containerRef} className={cn('relative', className)}>
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <MapPin className={cn('absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4', iconColor)} />
            <Input
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                setBlurred(false)
                suggestions.length > 0 && setShowDropdown(true)
              }}
              onBlur={() => setBlurred(true)}
              placeholder={placeholder}
              className={cn('pl-10 pr-10', glass && glassInput)}
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
              markerColor === 'pickup' ? 'border-green-200 text-green-600' : 'border-navy-200 text-navy-900',
              glass && glassButton
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
            onClick={handlePickOnMap}
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-md border flex items-center justify-center',
              'bg-background hover:bg-muted transition-colors',
              markerColor === 'pickup' ? 'border-green-200 text-green-600' : 'border-navy-200 text-navy-900',
              glass && glassButton
            )}
            title="Select on map"
          >
            <Map className="w-4 h-4" />
          </button>
        </div>

        {/* Typed text that was never actually picked (e.g. Enter pressed with no suggestion
            chosen, or the field left before one loaded) — this is what silently fails at submit
            otherwise, so flag it here instead. */}
        {blurred && !loading && !showDropdown && input.trim().length > 0 && !value && (
          <p className={cn('mt-1 text-xs px-1', glass ? 'text-navy-900/70' : 'text-muted-foreground')}>
            Pick "{input.trim()}" from the list, or use the pin or map button, to set this location.
          </p>
        )}

        {/* Suggestions dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div
            className={cn(
              'absolute z-50 w-full mt-1 border rounded-lg shadow-lg max-h-60 overflow-auto',
              glass ? glassDropdown : 'bg-background'
            )}
          >
            {suggestions.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => handleSelectPlace(result)}
                className={cn(
                  'w-full px-4 py-3 text-left transition-colors border-b last:border-b-0',
                  glass ? 'hover:bg-white/60 border-white/40 text-navy-900' : 'hover:bg-muted'
                )}
              >
                <p className="font-medium text-sm truncate">
                  {result.shortName}
                </p>
                <p className={cn('text-xs truncate', glass ? 'text-navy-900/60' : 'text-muted-foreground')}>
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
