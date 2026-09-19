import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import { searchPlaces, type PlaceSuggestion } from '@/shared/services/geocoding'

interface MapPlaceSearchProps {
  onSelect: (place: { lat: number; lng: number; name: string }) => void
  onClose: () => void
  // Where the map is looking right now; results near it are ranked first.
  getNearby?: () => { lat: number; lng: number } | null
}

const MIN_QUERY_LENGTH = 3
const DEBOUNCE_MS = 400

// Expanding place finder for the hero map. It only looks places up so the map
// can move there — it doesn't touch the trip fields or run a ride search.
export function MapPlaceSearch({ onSelect, onClose, getNearby }: MapPlaceSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestRef = useRef(0) // ignore out-of-order responses

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Collapse on Escape or a press anywhere outside the field.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const runSearch = useCallback(async (text: string) => {
    const requestId = ++requestRef.current
    setLoading(true)
    try {
      const found = await searchPlaces(text, { near: getNearby?.() ?? undefined })
      if (requestId !== requestRef.current) return
      setResults(found)
      setSearched(true)
    } catch (error) {
      console.error('Place search error:', error)
      if (requestId !== requestRef.current) return
      setResults([])
      setSearched(true)
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  // getNearby is read at call time, so its identity doesn't need to be a dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    setQuery(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (text.trim().length < MIN_QUERY_LENGTH) {
      requestRef.current++ // drop any in-flight lookup for the old text
      setResults([])
      setSearched(false)
      setLoading(false)
      return
    }
    debounceRef.current = setTimeout(() => runSearch(text.trim()), DEBOUNCE_MS)
  }

  const select = (place: PlaceSuggestion) => {
    onSelect({ lat: place.lat, lng: place.lng, name: place.shortName })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (results[0]) select(results[0])
  }

  const showEmpty = searched && !loading && results.length === 0 && query.trim().length >= MIN_QUERY_LENGTH

  return (
    // Small field, right-aligned by its parent. max-w caps it (rather than a
    // breakpoint width) so it can never stretch across the screen, however
    // much room the header row has.
    <div ref={rootRef} className="relative w-full max-w-xs pointer-events-auto">
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 h-10 rounded-full pl-3 pr-1.5 bg-white/80 border border-white/50 shadow-lg"
      >
        <Search className="w-4 h-4 flex-shrink-0 text-navy-900/60" />
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          placeholder="Search places on the map"
          aria-label="Search places on the map"
          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-navy-900 placeholder:text-navy-900/60"
        />
        {loading && <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-navy-900/60" />}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search"
          className="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-navy-900 hover:bg-black/5"
        >
          <X className="w-4 h-4" />
        </button>
      </form>

      {(results.length > 0 || showEmpty) && (
        <div className="absolute left-0 right-0 mt-2 max-h-72 overflow-auto rounded-xl bg-white/90 border border-white/60 shadow-xl text-navy-900">
          {results.map((place) => (
            <button
              key={place.id}
              type="button"
              onClick={() => select(place)}
              className="w-full px-4 py-3 text-left hover:bg-white/70 transition-colors border-b border-navy-900/10 last:border-b-0"
            >
              <p className="font-medium text-sm truncate">{place.shortName}</p>
              <p className="text-xs text-navy-900/60 truncate">{place.secondaryText}</p>
            </button>
          ))}
          {showEmpty && <p className="px-4 py-3 text-sm text-navy-900/60">No places found</p>}
        </div>
      )}
    </div>
  )
}
