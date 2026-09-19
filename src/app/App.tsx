import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/domains/core/auth/AuthContext'
import { ThemeProvider } from '@/shared/contexts/ThemeContext'
import { Toaster } from '@/shared/ui/toaster'
import { BottomNav } from '@/app/BottomNav'

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
      <div className="min-h-screen flex items-center justify-center">
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

// Layout with bottom nav - shows for all users, different nav for logged in
function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  )
}

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
        {/* Auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* PUBLIC routes - anyone can browse */}
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/rides/:id" element={<RideDetailsPage />} />
        <Route path="/requests" element={<RideRequestsPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />

        {/* PROTECTED routes - require login */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rides/create"
          element={
            <ProtectedRoute>
              <CreateRidePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/requests/new"
          element={
            <ProtectedRoute>
              <RequestRidePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookings/:id/pay"
          element={
            <ProtectedRoute>
              <PaymentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-rides"
          element={
            <ProtectedRoute>
              <MyRidesPage />
            </ProtectedRoute>
          }
        />

        {/* Admin routes */}
        <Route
          path="/admin/church-payouts"
          element={
            <ProtectedRoute>
              <AdminChurchPayoutsPage />
            </ProtectedRoute>
          }
        />

        {/* Church-specific landing pages - must be after all static routes */}
        {/* Routes: /watoto, /worshipharvest, /holycity, /miraclecenter, /phaneroo */}
        <Route path="/:churchSlug" element={<ChurchLandingPage />} />

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
        <Router>
          <AuthProvider>
            <AppRoutes />
            <Toaster />
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
