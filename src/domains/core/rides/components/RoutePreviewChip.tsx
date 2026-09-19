import { Route, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface RoutePreviewChipProps {
  origin?: string
  destination?: string
  summary: { distanceKm: number; durationMin: number } | null
  loading?: boolean
  onClear: () => void
  className?: string
}

// "Showing this ride's route on the map" with a way to dismiss it. The route stays
// on the map when you close a panel, so this is what tells you it's there and
// lets you clear it.
export function RoutePreviewChip({ origin, destination, summary, loading, onClear, className }: RoutePreviewChipProps) {
  const distance = summary
    ? summary.distanceKm < 1
      ? `${Math.round(summary.distanceKm * 1000)} m`
      : `${summary.distanceKm.toFixed(1)} km`
    : null

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-center gap-2 rounded-full bg-white/90 border border-white/50 shadow-lg pl-3 pr-1.5 py-1.5 text-sm text-navy-900 max-w-full',
        className
      )}
    >
      <Route className="w-4 h-4 flex-shrink-0 text-coral-500" />
      <span className="truncate">
        {origin && destination ? (
          <>
            <span className="font-medium">{origin}</span> → <span className="font-medium">{destination}</span>
          </>
        ) : (
          <span className="font-medium">Ride route</span>
        )}
      </span>
      {summary && (
        <span className="hidden sm:inline text-xs text-navy-900/70 whitespace-nowrap">
          · {distance} · ~{Math.round(summary.durationMin)} min
        </span>
      )}
      {loading && !summary && <span className="text-xs text-navy-900/60 whitespace-nowrap">finding route…</span>}
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear route from map"
        className="w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center hover:bg-black/5"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
