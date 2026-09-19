import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { ChevronDown, PanelLeftClose } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

interface MapPanelProps {
  children: ReactNode
  // Hides the panel (it stays mounted, so forms and scroll position are kept)
  onCollapse: () => void
  collapsed?: boolean
  // On phones, get out of the way (e.g. while the user places a pin on the map).
  hideOnMobile?: boolean
}

// Where a screen opens on top of the persistent map: a left-hand side panel on
// larger screens (like Google Maps), and a bottom sheet on phones that can be
// dragged (or tapped) between half height — map still visible above — and full.
export function MapPanel({ children, onCollapse, collapsed = false, hideOnMobile = false }: MapPanelProps) {
  const [snap, setSnap] = useState<'half' | 'full'>('half')
  const dragStartY = useRef<number | null>(null)

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragStartY.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return
    const dy = e.clientY - dragStartY.current
    dragStartY.current = null
    if (dy < -30) setSnap('full')
    else if (dy > 30) setSnap('half')
    else setSnap((current) => (current === 'half' ? 'full' : 'half')) // a tap toggles
  }

  return (
    <aside
      aria-label="Details"
      className={cn(
        'fixed z-40 flex flex-col overflow-hidden bg-background',
        'animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-left-4 duration-200',
        // Phones: bottom sheet above the bottom nav (h-16)
        'inset-x-0 bottom-16 transition-[height]',
        snap === 'full'
          ? 'h-[calc(100dvh-4rem)]'
          : 'h-[55dvh] rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.25)]',
        // Larger screens: full-height left panel
        'md:inset-x-auto md:left-0 md:top-0 md:h-auto md:w-[420px] md:rounded-none md:border-r md:shadow-2xl',
        hideOnMobile && 'max-md:hidden',
        collapsed && 'hidden'
      )}
    >
      {/* Drag handle (phones only) */}
      <div
        className="md:hidden shrink-0 h-7 flex items-center justify-center touch-none cursor-grab"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        role="button"
        aria-label={snap === 'half' ? 'Expand panel' : 'Collapse panel'}
      >
        <div className="w-10 h-1.5 rounded-full bg-muted-foreground/40" />
      </div>

      <button
        type="button"
        onClick={onCollapse}
        aria-label="Hide panel"
        className="absolute right-3 top-2 md:top-2 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white/90 text-navy-900 border border-black/5 shadow hover:bg-white"
      >
        <PanelLeftClose className="w-5 h-5 hidden md:block" />
        <ChevronDown className="w-5 h-5 md:hidden" />
      </button>

      <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </aside>
  )
}
