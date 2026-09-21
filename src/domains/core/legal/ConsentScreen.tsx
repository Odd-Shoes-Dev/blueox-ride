import { useState } from 'react'
import { useAuth } from '@/domains/core/auth/AuthContext'
import { TermsCheckbox } from '@/domains/core/legal/TermsCheckbox'
import { Button } from '@/shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card'
import { useToast } from '@/shared/hooks/use-toast'
import { getErrorMessage } from '@/shared/lib/utils'

// Shown once, in place of the app, to a signed-in person who hasn't agreed to the current
// Terms and Privacy Policy yet: anyone who joined with Google, accounts from before we kept
// a record, and everyone again if the documents change materially (LEGAL.consentVersion).
// Email sign-ups tick the same box on the register form, so they never see this.
export function ConsentScreen() {
  const { user, acceptTerms, signOut } = useAuth()
  const { toast } = useToast()
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleContinue = async () => {
    setSaving(true)
    const { error } = await acceptTerms()
    if (error) {
      toast({ title: 'Could not save your agreement', description: getErrorMessage(error), variant: 'destructive' })
      setSaving(false)
    }
    // On success the screen goes away by itself: the profile now carries the agreement.
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-b from-navy-50 to-white dark:bg-none dark:bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src="/assets/logo.png" alt="Blue OX Rides" className="mx-auto mb-2 w-20 h-20 object-contain" />
          <CardTitle className="text-2xl font-bold">One last step</CardTitle>
          <CardDescription>
            Please read and agree to how Blue OX Rides works and how we handle your information.
            {user?.email && (
              <>
                {' '}
                Signed in as <strong>{user.email}</strong>.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
            <li>Drivers and passengers you travel with can see your name and profile photo.</li>
            <li>Your device location is used only if you allow it in your browser, and we don't keep a history of it.</li>
            <li>
              While a driver's trip is running, their live position is shared with passengers who have a confirmed
              booking. It isn't stored.
            </li>
          </ul>

          <TermsCheckbox id="consent-agree" checked={agreed} onChange={setAgreed} />

          <div className="space-y-2">
            <Button className="w-full" disabled={!agreed} loading={saving} onClick={handleContinue}>
              Agree and continue
            </Button>
            <Button variant="ghost" className="w-full" onClick={signOut} disabled={saving}>
              Sign out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
