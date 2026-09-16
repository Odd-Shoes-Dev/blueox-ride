import { Link, useLocation } from 'react-router-dom'
import { Home, Search, PlusCircle, Calendar, User, LogIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'

// Nav items for logged-in users
const authNavItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/search', icon: Search, label: 'Search' },
  { path: '/rides/create', icon: PlusCircle, label: 'Offer' },
  { path: '/my-rides', icon: Calendar, label: 'My Rides' },
  { path: '/profile', icon: User, label: 'Profile' },
]

// Nav items for guests
const guestNavItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/search', icon: Search, label: 'Search' },
  { path: '/login', icon: LogIn, label: 'Sign In' },
]

export function BottomNav() {
  const location = useLocation()
  const { user } = useAuth()

  const navItems = user ? authNavItems : guestNavItems

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t safe-bottom z-50">
      <div className="max-w-lg mx-auto flex items-center justify-around h-16">
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
