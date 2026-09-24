# The map shell

The app is one persistent map with every screen shown on top of it, in the style of Google Maps.

## The idea

`src/app/MapShell.tsx` is a layout route that keeps **one** map mounted. Moving between screens never reloads
the map or asks for the user's location again.

- **Home** (`/` and the church pages) scrolls over the fixed map. The search card floats on the map.
- **Panel screens** open on top of the map: a **420px left panel** on larger screens, a **draggable bottom sheet**
  on phones. They are listed in `PANEL_ROUTES` in `src/app/App.tsx`, each with a title.
- **Standalone pages** keep their own layout: login, register, terms, privacy, payment, admin. (Legal pages need
  independent links; Google sign-in leaves the site and returns; payment redirects out.)
- The logo goes home. Hiding a panel never loses its state (it stays mounted):
  - **Larger screens:** the panel-close button in its corner, or the **edge tab** (`‹` / `›`) on the panel's right
    edge, hides it; the same tab (now at the screen's left edge) or the menu pill by the logo brings it back.
  - **Phones:** the sheet has three heights — **peek** (just a title bar above the bottom nav, map almost full
    screen), **half** and **full**. Drag the handle up or down, or tap it, to move between them. A small drag (past
    30px) nudges one step; a bigger, deliberate pull (past 120px) skips straight to the end — full from anywhere
    pulling up, peek from anywhere pulling down — so pulling all the way down from full reaches peek in one
    continuous gesture instead of needing a second drag to get past half (`NUDGE_PX`/`PULL_PX` in `MapPanel.tsx`).
    The handle's own touch target is taller than it looks at half/full (no title row there to pad it out like at
    peek), so it's not a thin strip to land a thumb on — dragging only works from that handle, not the panel's
    content below it. A new screen opens at half. The map is sized to whatever the sheet leaves (`MapShell` owns
    the height; `MapPanel` draws it; the peek bar is 3.5rem in both places, so change them together).
- **Minimising a panel brings back the search card.** The "Where are you going?" card (`TripSearchStack`) is shown
  by the home screen, and by any panel screen whose panel is hidden (larger screens) or at a peek (phones), so the
  way back to searching is to slide the panel away, and expanding it returns to the screen you left, with its form
  intact. It's the same card and the same trip (the shell holds pickup and destination). It stays off while a
  panel is half or fully open, where it would crowd the map — and **for the whole duration of a live trip**
  (driving or following one), since searching for a different ride doesn't make sense mid-trip, and on a phone it
  was crowding the trip bar for the same strip of screen. The separate route-preview chip (for a route looked at
  earlier, distinct from the trip itself) is hidden for the same reason and the same duration — the trip bar
  already owns "which route you're on" while a trip is running.

## Shared map state

`src/domains/core/rides/map/` (`MapShellContext.ts`, `MapShellProvider.tsx`) holds what the map and screens share:
the ride list and search results, the searched trip (pickup, destination, dashed line — kept on every screen),
placing a pin (`requestPin()` resolves with the chosen point), the ride whose route is previewed (it stays until
cleared), the driver's own upcoming rides, and the live trip.

The layering rule: `domains/core` never imports `domains/church`; `shared` never imports `domains`; only `app`
imports both.

## Things to know when adding a screen

- New screens that should sit over the map go in `PANEL_ROUTES`.
- The panel is only 420px wide: don't use viewport breakpoints (`md:grid-cols-*`) or full-width `fixed` bars inside
  a panel page; use `sticky` for bars.
- To show pins for a screen's own trip, call `useMapPins(origin, destination)`; to show a ride's route, use
  `useRideRouteOnMap(ride)`.
- `LocationPicker` automatically places pins on the shared map when used inside the shell.

## Location and search

- Location uses a quick reading (Wi-Fi/towers) and a precise GPS reading together; the quick one appears at once with an
  accuracy circle and GPS sharpens it.
- "Find a Ride" matches by **distance**: rides that start within 12 km of the pickup and end within 12 km of the
  destination (30 km with "search wider"), nearest first, in a results panel. Its optional "Leaving on" date is
  bounded to the earliest and latest departure actually found across all dates (`SearchResults.dateBounds`, set from
  the first, unfiltered search and kept while narrowing to one date), so it can't be pointed at a day nothing on
  the route could ever match.
- Place search uses MapTiler (with OpenStreetMap as a fallback); routes use OSRM's public server.
