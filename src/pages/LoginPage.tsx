import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginPageSEO } from '@/components/SEO'
import { useToast } from '@/hooks/use-toast'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()

  // Handle both string and object formats for redirect URL
  const locationState = location.state as { from?: string | { pathname: string } } | null
  const from = typeof locationState?.from === 'string'
    ? locationState.from
    : locationState?.from?.pathname || '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await signIn(email, password)

    if (error) {
      toast({
        title: 'Login failed',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Welcome back!',
        description: 'You have successfully logged in.',
        variant: 'success',
      })
      navigate(from, { replace: true })
    }

    setLoading(false)
  }

  return (
    <>
      <LoginPageSEO />
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-b from-navy-50 to-white">
        <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img
            src="/assets/logo.png"
            alt="Blue OX Rides"
            className="mx-auto mb-2 w-20 h-20 object-contain"
          />
          <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
          <CardDescription>Sign in to your Blue OX Rides account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Don't have an account? </span>
            <Link to="/register" className="text-primary font-medium hover:underline">
              Sign up
            </Link>
          </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
