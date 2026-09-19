import { Link, Outlet } from 'react-router-dom'

// Layout route for every page except the landing page (which has its own logo
// pill): adds a small logo in the top-left corner that always links home.
// It scrolls with the page rather than floating, so it never covers content
// you're reading. Sized to fit in the 3rem of space above each page header's
// back button, so it doesn't collide with it.
export function SiteLogoLayout() {
  return (
    <div className="relative">
      <Link
        to="/"
        aria-label="Blue OX Rides home"
        className="absolute top-2 left-3 z-30 w-9 h-9 rounded-full flex items-center justify-center bg-white/80 border border-white/50 shadow-md hover:bg-white/90 transition-colors"
      >
        <img src="/assets/logo1.png" alt="" className="w-6 h-6 object-contain" />
      </Link>
      <Outlet />
    </div>
  )
}
