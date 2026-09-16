import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Button } from '@/components/ui/button'
import { X, MapPin, Loader2, Check, Navigation } from 'lucide-react'
import { cn } from '@/lib/utils'
import 'leaflet/dist/leaflet.css'

interface Location {
  lat: number
  lng: number
  name: string
}

interface MapLocationPickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (location: Location) => void
  initialLocation?: Location | null
  title?: string
  markerColor?: 'pickup' | 'dropoff'
}

// Custom marker icon
const createIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background-color: ${color};
      width: 32px;
      height: 32px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  })
}

// Component to handle map clicks
function MapClickHandler({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onLocationSelect(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// Component to recenter map
function RecenterMap({ location }: { location: { lat: number; lng: number } | null }) {
  const map = useMap()

  useEffect(() => {
    if (location) {
      map.setView([location.lat, location.lng], 15)
    }
  }, [map, location])

  return null
}

export function MapLocationPicker({
  isOpen,
  onClose,
  onSelect,
  initialLocation,
  title = 'Select Location',
  markerColor = 'pickup',
}: MapLocationPickerProps) {
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(
    initialLocation ? { lat: initialLocation.lat, lng: initialLocation.lng } : null
  )
  const [locationName, setLocationName] = useState<string>(initialLocation?.name || '')
  const [loading, setLoading] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)

  // Default center (Kampala, Uganda)
  const defaultCenter: [number, number] = [0.3476, 32.5825]

  // Get user's current location
  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }

    setGettingLocation(true)

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        setSelectedLocation({ lat: latitude, lng: longitude })
        reverseGeocode(latitude, longitude)
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
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    )
  }

  const markerIcon = createIcon(markerColor === 'pickup' ? '#FF4040' : '#193153')

  // Reverse geocode to get address from coordinates
  const reverseGeocode = async (lat: number, lng: number) => {
    setLoading(true)
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'en',
          },
        }
      )

      if (!response.ok) {
        throw new Error('Reverse geocoding failed')
      }

      const data = await response.json()

      // Build a short, readable name
      let name = ''
      if (data.address) {
        const parts: string[] = []
        if (data.address.road) parts.push(data.address.road)
        if (data.address.suburb) parts.push(data.address.suburb)
        const city = data.address.city || data.address.town || data.address.village
        if (city) parts.push(city)
        name = parts.length > 0 ? parts.join(', ') : data.display_name?.split(',').slice(0, 2).join(',') || 'Selected location'
      } else {
        name = data.display_name?.split(',').slice(0, 2).join(',') || 'Selected location'
      }

      setLocationName(name)
    } catch (error) {
      console.error('Reverse geocoding error:', error)
      setLocationName(`${lat.toFixed(4)}, ${lng.toFixed(4)}`)
    } finally {
      setLoading(false)
    }
  }

  // Handle map tap
  const handleLocationSelect = (lat: number, lng: number) => {
    setSelectedLocation({ lat, lng })
    reverseGeocode(lat, lng)
  }

  // Handle confirm
  const handleConfirm = () => {
    if (selectedLocation && locationName) {
      onSelect({
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        name: locationName,
      })
      onClose()
    }
  }

  // Reset when opening
  useEffect(() => {
    if (isOpen) {
      if (initialLocation) {
        setSelectedLocation({ lat: initialLocation.lat, lng: initialLocation.lng })
        setLocationName(initialLocation.name)
      } else {
        setSelectedLocation(null)
        setLocationName('')
      }
    }
  }, [isOpen, initialLocation])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-background">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button onClick={onClose} className="p-2 -ml-2 hover:bg-muted rounded-full">
            <X className="w-5 h-5" />
          </button>
          <h2 className="font-semibold">{title}</h2>
          <div className="w-9" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Map */}
      <div className="absolute inset-0 pt-14 pb-32">
        <MapContainer
          center={initialLocation ? [initialLocation.lat, initialLocation.lng] : defaultCenter}
          zoom={initialLocation ? 15 : 12}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler onLocationSelect={handleLocationSelect} />

          {selectedLocation && (
            <>
              <Marker
                position={[selectedLocation.lat, selectedLocation.lng]}
                icon={markerIcon}
              />
              <RecenterMap location={selectedLocation} />
            </>
          )}
        </MapContainer>

        {/* Center crosshair hint (shows when no location selected) */}
        {!selectedLocation && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-background/90 backdrop-blur px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
              <MapPin className="w-4 h-4 text-coral-500" />
              <span className="text-sm">Tap on the map to select location</span>
            </div>
          </div>
        )}

        {/* Current location button */}
        <button
          type="button"
          onClick={getCurrentLocation}
          disabled={gettingLocation}
          className="absolute bottom-36 right-4 z-[1000] bg-background shadow-lg rounded-full p-3 border hover:bg-muted transition-colors"
          title="Use my current location"
        >
          {gettingLocation ? (
            <Loader2 className="w-5 h-5 animate-spin text-coral-500" />
          ) : (
            <Navigation className="w-5 h-5 text-coral-500" />
          )}
        </button>
      </div>

      {/* Bottom panel */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] bg-background border-t p-4">
        <div className="max-w-lg mx-auto space-y-3">
          {selectedLocation ? (
            <>
              <div className="flex items-start gap-3">
                <MapPin className={cn(
                  'w-5 h-5 mt-0.5 flex-shrink-0',
                  markerColor === 'pickup' ? 'text-coral-500' : 'text-navy-900'
                )} />
                <div className="flex-1 min-w-0">
                  {loading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Finding address...</span>
                    </div>
                  ) : (
                    <>
                      <p className="font-medium truncate">{locationName}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedLocation.lat.toFixed(5)}, {selectedLocation.lng.toFixed(5)}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={handleConfirm}
                disabled={loading || !locationName}
              >
                <Check className="w-4 h-4 mr-2" />
                Confirm Location
              </Button>
            </>
          ) : (
            <div className="text-center py-2 text-muted-foreground">
              <p className="text-sm">Tap anywhere on the map to select a location</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
