import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { ChevronUp, PanelLeftClose } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

// How far a phone's bottom sheet is pulled up: just its title bar, half the
// screen (map still visible above), or the whole screen.
export type SheetSnap = 'peek' | 'half' | 'full'

interface MapPanelProps {
  children: ReactNode
  // Shown on the sheet's title bar when it is pulled down to a peek.
  title: string
  // Phones: which height the bottom sheet is at, and how it changes. The map above
  // it needs to know the height too, so the shell owns this.
  snap: SheetSnap
  onSnapChange: (snap: SheetSnap) => void
  // Larger screens: hides the side panel (it stays mounted, so forms and scroll
  // position are kept). Phones don't hide it — they pull it down to a peek.
  onCollapse: () => void
  collapsed?: boolean
  // On phones, get out of the way (e.g. while the user places a pin on the map).
  hideOnMobile?: boolean
}

const HIGHER: Record<SheetSnap, SheetSnap> = { peek: 'half', half: 'full', full: 'full' }
const LOWER: Record<SheetSnap, SheetSnap> = { full: 'half', half: 'peek', peek: 'peek' }
// A tap goes to the next taller height, or from full back down to half.
const TAPPED: Record<SheetSnap, SheetSnap> = { peek: 'half', half: 'full', full: 'half' }

// Where a screen opens on top of the persistent map: a left-hand side panel on
// larger screens (like Google Maps), and a bottom sheet on phones that can be
// dragged (or tapped) between peek, half and full height.
export function MapPanel({
  children,
  title,
  snap,
  onSnapChange,
  onCollapse,
  collapsed = false,
  hideOnMobile = false,
}: MapPanelProps) {
  const dragStartY = useRef<number | null>(null)

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragStartY.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return
    const dy = e.clientY - dragStartY.current
    dragStartY.current = null
    if (dy < -30) onSnapChange(HIGHER[snap])
    else if (dy > 30) onSnapChange(LOWER[snap])
    else onSnapChange(TAPPED[snap])
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSnapChange(TAPPED[snap])
    }
  }

  return (
    <aside
      aria-label={title}
      className={cn(
        'fixed z-40 flex flex-col overflow-hidden bg-background',
        'animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-left-4 duration-200',
        // Phones: bottom sheet above the bottom nav (h-16). The peek is 3.5rem tall —
        // the shell sizes the map to what's left, so keep the two in step.
        'inset-x-0 bottom-16 transition-[height]',
        snap === 'full' && 'h-[calc(100dvh-4rem)]',
        snap === 'half' && 'h-[55dvh] rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.25)]',
        snap === 'peek' && 'h-14 rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.25)]',
        // Larger screens: full-height left panel
        'md:inset-x-auto md:left-0 md:top-0 md:h-auto md:w-[420px] md:rounded-none md:border-r md:shadow-2xl',
        hideOnMobile && 'max-md:hidden',
        collapsed && 'md:hidden'
      )}
    >
      {/* Drag handle and, at a peek, the title bar (phones only). Drag up or down,
          or tap, to change height. */}
      <div
        className="md:hidden shrink-0 touch-none cursor-grab select-none"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragStartY.current = null
        }}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={snap === 'peek' ? `Show ${title}` : snap === 'half' ? 'Expand panel' : 'Shrink panel'}
      >
        <div className="h-6 flex items-center justify-center">
          <div className="w-10 h-1.5 rounded-full bg-muted-foreground/40" />
        </div>
        {snap === 'peek' && (
          <div className="h-8 px-4 flex items-center justify-between text-sm font-semibold text-foreground">
            <span className="truncate">{title}</span>
            <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onCollapse}
        aria-label="Hide panel"
        className="max-md:hidden absolute right-3 top-2 z-10 w-9 h-9 rounded-full flex items-center justify-center bg-white/90 text-navy-900 border border-black/5 shadow hover:bg-white"
      >
        <PanelLeftClose className="w-5 h-5" />
      </button>

      {/* Kept mounted at a peek (so nothing is lost), but out of sight and out of reach.
          `invisible` on phones only — the same panel is the full-height side panel on larger screens. */}
      <div className={cn('flex-1 overflow-y-auto overscroll-contain', snap === 'peek' && 'max-md:invisible')}>
        {children}
      </div>
    </aside>
  )
}
