# The map shell

The app is one persistent map with every screen shown on top of it, in the style of Google Maps.

## The idea

`src/app/MapShell.tsx` is a layout route that keeps **one** map mounted. Moving between screens never reloads
the map or asks for the user's location again.

- **Home** (`/` and the church pages) scrolls over the fixed map. The search card floats on the map.
- **Panel screens** open on top of the map: a **420px left panel** on larger screens, a **draggable bottom sheet**
  on phones (half height, or full). They are listed in `PANEL_ROUTES` in `src/app/App.tsx`, each with a title.
- **Standalone pages** keep their own layout: login, register, terms, privacy, payment, admin. (Legal pages need
  independent links; Google sign-in leaves the site and returns; payment redirects out.)
- A panel can be **hidden** (the button in its corner) without losing its state, and a menu pill by the logo brings
  it back exactly as it was. The logo goes home.

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
  destination (30 km with "search wider"), nearest first, in a results panel.
- Place search uses MapTiler (with OpenStreetMap as a fallback); routes use OSRM's public server.
