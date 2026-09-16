import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { Toaster } from '@/components/ui/toaster'
import { BottomNav } from '@/components/BottomNav'

// Pages
import HomePage from '@/pages/HomePage'
import ChurchLandingPage from '@/pages/ChurchLandingPage'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import ProfilePage from '@/pages/ProfilePage'
import CreateRidePage from '@/pages/CreateRidePage'
import RideDetailsPage from '@/pages/RideDetailsPage'
import PaymentPage from '@/pages/PaymentPage'
import MyRidesPage from '@/pages/MyRidesPage'
import SearchPage from '@/pages/SearchPage'
import AdminChurchPayoutsPage from '@/pages/AdminChurchPayoutsPage'

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-navy-50 to-white">
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
      <Router>
        <AuthProvider>
          <AppRoutes />
          <Toaster />
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  )
}
