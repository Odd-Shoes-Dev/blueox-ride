import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RegisterPageSEO } from '@/components/SEO'
import { useToast } from '@/hooks/use-toast'

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure your passwords match.',
        variant: 'destructive',
      })
      return
    }

    if (password.length < 6) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 6 characters.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)

    const { error } = await signUp(email, password, fullName)

    if (error) {
      toast({
        title: 'Registration failed',
        description: error.message,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Account created!',
        description: 'Welcome to Blue OX Rides! Please check your email to verify your account.',
        variant: 'success',
      })
      navigate('/')
    }

    setLoading(false)
  }

  return (
    <>
      <RegisterPageSEO />
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-b from-navy-50 to-white">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <img
              src="/assets/logo.png"
              alt="Blue OX Rides"
              className="mx-auto mb-2 w-20 h-20 object-contain"
            />
            <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
            <CardDescription>Join Blue OX Rides and start traveling together</CardDescription>
          </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
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
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              Create Account
            </Button>
          </form>

          <p className="mt-4 text-xs text-center text-muted-foreground">
            By signing up, you agree to our Terms of Service and Privacy Policy.
          </p>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link to="/login" className="text-primary font-medium hover:underline">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
