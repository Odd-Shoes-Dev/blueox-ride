import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/domains/core/auth/AuthContext'
import { ThemeProvider } from '@/shared/contexts/ThemeContext'
import { AppSettingsProvider } from '@/shared/contexts/AppSettingsProvider'
import { usePayments } from '@/shared/contexts/AppSettingsContext'
import { BookingRequestsProvider } from '@/domains/core/rides/requests/BookingRequestsProvider'
import { Toaster } from '@/shared/ui/toaster'
import { BottomNav } from '@/app/BottomNav'
import { SiteLogoLayout } from '@/app/SiteLogoLayout'
import { MapShell } from '@/app/MapShell'

// Pages
import HomePage from '@/domains/core/rides/pages/HomePage'
import LoginPage from '@/domains/core/auth/LoginPage'
import RegisterPage from '@/domains/core/auth/RegisterPage'
import ProfilePage from '@/domains/core/profile/ProfilePage'
import CreateRidePage from '@/domains/core/rides/pages/CreateRidePage'
import RideDetailsPage from '@/domains/core/rides/pages/RideDetailsPage'
import PaymentPage from '@/domains/core/payments/PaymentPage'
import MyRidesPage from '@/domains/core/rides/pages/MyRidesPage'
import SearchPage from '@/domains/core/rides/pages/SearchPage'
import RideRequestsPage from '@/domains/core/rides/pages/RideRequestsPage'
import RequestRidePage from '@/domains/core/rides/pages/RequestRidePage'
import SearchResultsPage from '@/domains/core/rides/pages/SearchResultsPage'
import BookingRequestsPage from '@/domains/core/rides/pages/BookingRequestsPage'
import ChurchLandingPage from '@/domains/church/ChurchLandingPage'
import AdminChurchPayoutsPage from '@/domains/church/AdminChurchPayoutsPage'
import PrivacyPolicyPage from '@/domains/core/legal/PrivacyPolicyPage'
import TermsPage from '@/domains/core/legal/TermsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

// Protected route wrapper - redirects to login with return URL
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-[60dvh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user) {
    // Save the attempted URL for redirect after login
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}

// The payment screen only exists while payments are switched on. With them off nothing is
// owed, so anyone who lands here (an old link, a bookmark) is sent to their rides instead.
function PaymentsOnly({ children }: { children: React.ReactNode }) {
  const { paymentsEnabled, loading } = usePayments()

  if (loading) {
    return (
      <div className="min-h-[60dvh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }
  if (!paymentsEnabled) return <Navigate to="/my-rides" replace />
  return <>{children}</>
}

// Layout with bottom nav - shows for all users, different nav for logged in
function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  )
}

// Screens that open as a panel over the map (see MapShell). Anything not listed
// here and not standalone below is the home screen. Order doesn't matter.
// `title` names the panel on the button that reopens it after it has been hidden.
const PANEL_ROUTES: { path: string; title: string; element: React.ReactNode }[] = [
  { path: '/search', title: 'Search rides', element: <SearchPage /> },
  { path: '/results', title: 'Ride results', element: <SearchResultsPage /> },
  { path: '/rides/:id', title: 'Ride details', element: <RideDetailsPage /> },
  { path: '/requests', title: 'Ride requests', element: <RideRequestsPage /> },
  { path: '/rides/create', title: 'Offer a ride', element: <ProtectedRoute><CreateRidePage /></ProtectedRoute> },
  { path: '/requests/new', title: 'Request a ride', element: <ProtectedRoute><RequestRidePage /></ProtectedRoute> },
  { path: '/booking-requests', title: 'Booking requests', element: <ProtectedRoute><BookingRequestsPage /></ProtectedRoute> },
  { path: '/my-rides', title: 'My rides', element: <ProtectedRoute><MyRidesPage /></ProtectedRoute> },
  { path: '/profile', title: 'Profile', element: <ProtectedRoute><ProfilePage /></ProtectedRoute> },
]

function AppRoutes() {
  const { loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-navy-50 to-white dark:bg-none dark:bg-background">
        <div className="text-center">
          <img
            src="/assets/logo.png"
            alt="Blue OX Rides"
            className="w-28 h-28 object-contain mx-auto mb-4"
          />
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral-500 mx-auto" />
        </div>
      </div>
    )
  }

  return (
    <AppLayout>
      <Routes>
        {/* One persistent map with every screen shown on top of it: the home
            screen scrolls over the map, the rest open as a side panel (desktop)
            or bottom sheet (phones). Moving between them never reloads the map. */}
        <Route element={<MapShell panels={PANEL_ROUTES.map(({ path, title }) => ({ path, title }))} />}>
          <Route path="/" element={<HomePage />} />
          {PANEL_ROUTES.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}

          {/* Church-specific landing pages - the home screen with church branding.
              Static routes outrank this, so it only catches church slugs.
              Routes: /watoto, /worshipharvest, /holycity, /miraclecenter, /phaneroo */}
          <Route path="/:churchSlug" element={<ChurchLandingPage />} />
        </Route>

        {/* Standalone pages (own URL, own layout, no map): they get the corner
            logo and account button from SiteLogoLayout */}
        <Route element={<SiteLogoLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route
            path="/bookings/:id/pay"
            element={
              <PaymentsOnly>
                <ProtectedRoute>
                  <PaymentPage />
                </ProtectedRoute>
              </PaymentsOnly>
            }
          />
          <Route
            path="/admin/church-payouts"
            element={
              <ProtectedRoute>
                <AdminChurchPayoutsPage />
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppSettingsProvider>
          <Router>
            <AuthProvider>
              <BookingRequestsProvider>
                <AppRoutes />
              </BookingRequestsProvider>
              <Toaster />
            </AuthProvider>
          </Router>
        </AppSettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
