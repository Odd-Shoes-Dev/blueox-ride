import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar'

// Pages where a corner account button would be pointless: Profile is where the
// avatar leads, and Login/Register are where a guest's Sign In would lead.
const NO_ACCOUNT_CORNER = ['/profile', '/login', '/register']

// Corner buttons for the STANDALONE pages (login, register, privacy, terms,
// payment, admin) — the ones that have their own URL and layout instead of
// opening as a panel over the map. (Map screens get the same buttons from
// MapShell.) Top-left: the logo, always linking home. Top-right: the signed-in
// user's avatar (links to their profile) or a Sign In pill for guests. They
// scroll with the page rather than floating, so they never cover content
// you're reading, and they're sized to fit in the 3rem of space above each
// page header's back button.
export function SiteLogoLayout() {
  const { user, profile } = useAuth()
  const { pathname } = useLocation()
  const showAccountCorner = !NO_ACCOUNT_CORNER.includes(pathname)

  const initials =
    (profile?.full_name || user?.email || '?')
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)

  const cornerSurface =
    'absolute top-2 z-30 flex items-center justify-center bg-white/80 border border-white/50 shadow-md hover:bg-white/90 transition-colors'

  return (
    <div className="relative">
      <Link
        to="/"
        aria-label="Blue OX Rides home"
        className={`${cornerSurface} left-3 w-9 h-9 rounded-full`}
      >
        <img src="/assets/logo1.png" alt="" className="w-6 h-6 object-contain" />
      </Link>

      {showAccountCorner &&
        (user ? (
          <Link to="/profile" aria-label="Your profile" className="absolute top-2 right-3 z-30 rounded-full shadow-md">
            <Avatar className="w-9 h-9 border border-white/50">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-white text-navy-900 text-sm font-semibold">{initials}</AvatarFallback>
            </Avatar>
          </Link>
        ) : (
          <Link
            to="/login"
            className={`${cornerSurface} right-3 h-9 px-4 rounded-full text-navy-900 text-sm font-medium whitespace-nowrap`}
          >
            Sign In
          </Link>
        ))}

      <Outlet />
    </div>
  )
}
