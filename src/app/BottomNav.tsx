import { Link, useLocation } from 'react-router-dom'
import { PlusCircle, Calendar, User } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useAuth } from '@/domains/core/auth/AuthContext'

// Nav items for logged-in users. Home/Search/Sign In live in the hero's top
// corners instead (logo → home, search button, sign-in button).
const authNavItems = [
  { path: '/rides/create', icon: PlusCircle, label: 'Offer' },
  { path: '/my-rides', icon: Calendar, label: 'My Rides' },
  { path: '/profile', icon: User, label: 'Profile' },
]

// Nav items for guests — none; every guest action is in the hero corners
const guestNavItems: typeof authNavItems = []

export function BottomNav() {
  const location = useLocation()
  const { user } = useAuth()

  const navItems = user ? authNavItems : guestNavItems

  if (navItems.length === 0) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t safe-bottom z-50">
      <div className="max-w-lg md:max-w-xl mx-auto flex items-center justify-around h-16">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-lg transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className={cn('w-5 h-5', isActive && 'stroke-[2.5]')} />
              <span className="text-xs font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
