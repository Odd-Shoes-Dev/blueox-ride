import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-UG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

// A date as 'YYYY-MM-DD' in the browser's own timezone — what an <input type="date"> needs.
// Deliberately not `.toISOString().split('T')[0]`, which converts to UTC first and can land on
// the wrong calendar day near midnight, in either direction, for anyone off UTC+0.
export function toLocalDateInput(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// The message from an error of any shape (a JavaScript Error, or the plain error object the
// database client throws), for showing to the user.
export function getErrorMessage(error: unknown, fallback = 'Please try again.'): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

export function calculateBookingFee(ridePrice: number): number {
  return Math.ceil(ridePrice * 0.1)
}

export function calculateDriverPayout(ridePrice: number): number {
  return ridePrice - calculateBookingFee(ridePrice)
}
