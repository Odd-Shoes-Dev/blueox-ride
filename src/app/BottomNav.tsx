import { Link, useLocation } from 'react-router-dom'
import { PlusCircle, Calendar } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useAuth } from '@/domains/core/auth/AuthContext'

// Same two tabs for everyone. Home, Profile and Sign In live in the top corners
// of every page instead (logo → home, avatar → profile, Sign In pill).
// Both destinations need an account, so for guests a tap goes to Login and
// returns them here afterwards (same behaviour as the landing page's cards).
const navItems = [
  { path: '/rides/create', icon: PlusCircle, label: 'Offer' },
  { path: '/my-rides', icon: Calendar, label: 'My Rides' },
]

export function BottomNav() {
  const location = useLocation()
  const { user } = useAuth()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t safe-bottom z-50">
      <div className="max-w-lg md:max-w-xl mx-auto flex items-center justify-around h-16">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path
          return (
            <Link
              key={path}
              to={user ? path : '/login'}
              state={user ? undefined : { from: path }}
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
