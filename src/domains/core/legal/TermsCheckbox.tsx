import { LEGAL } from '@/domains/core/legal/legalConfig'

interface TermsCheckboxProps {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
}

// The "I agree" box shown at sign-up and on the consent screen. It starts unticked on
// purpose: agreeing has to be a deliberate act. The links open in a new tab so reading the
// documents doesn't lose what's been typed.
export function TermsCheckbox({ id, checked, onChange }: TermsCheckboxProps) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
      />
      <label htmlFor={id} className="text-sm text-muted-foreground leading-snug">
        I am {LEGAL.minimumAge} or older and I agree to the{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline text-foreground">
          Terms of Use
        </a>{' '}
        and the{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline text-foreground">
          Privacy Policy
        </a>
        .
      </label>
    </div>
  )
}
