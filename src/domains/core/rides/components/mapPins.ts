import L from 'leaflet'

// Pickup and destination pins. Colours are deliberately distinct from the
// blue "you are here" dot and the coral ride-offer markers, and the two pins
// differ in shape (dot vs flag) as well as colour so they're tellable apart
// without relying on colour alone.
export type PinKind = 'pickup' | 'dropoff'

export const PIN_COLORS: Record<PinKind, string> = {
  pickup: '#16A34A', // green — "start"
  dropoff: '#193153', // navy (brand) — "destination"
}

const PIN_ASPECT = 40 / 32 // viewBox height / width

// Teardrop pin with its tip at the bottom-centre of the box, plus a white
// glyph (dot for pickup, flag for destination). Static, trusted markup.
export function pinSvg(kind: PinKind, width = 32): string {
  const height = Math.round(width * PIN_ASPECT)
  const glyph =
    kind === 'pickup'
      ? '<circle cx="16" cy="15" r="5" fill="white"/>'
      : '<path d="M12 22V9" stroke="white" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M12 9h9l-2.5 3.5L21 16h-9z" fill="white" stroke="white" stroke-width="1" stroke-linejoin="round"/>'

  return (
    `<svg width="${width}" height="${height}" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg" ` +
    `style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35))">` +
    `<path d="M16 39C16 39 3 24.5 3 15a13 13 0 0 1 26 0c0 9.5-13 24-13 24z" ` +
    `fill="${PIN_COLORS[kind]}" stroke="white" stroke-width="2"/>` +
    glyph +
    `</svg>`
  )
}

export function pinIcon(kind: PinKind): L.DivIcon {
  return L.divIcon({
    className: 'hero-pin-marker',
    html: pinSvg(kind, 32),
    iconSize: [32, 40],
    iconAnchor: [16, 40],
  })
}
