import { supabase } from './client'
import type { Payment } from '@/shared/types'

export async function getLatestPaymentForBooking(bookingId: string): Promise<Payment | null> {
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return (data as Payment) ?? null
}

export async function getPaymentById(paymentId: string): Promise<Payment | null> {
  const { data } = await supabase.from('payments').select('*').eq('id', paymentId).single()
  return (data as Payment) ?? null
}

export async function getPaymentByReference(reference: string): Promise<Payment | null> {
  const { data } = await supabase
    .from('payments')
    .select('*')
    .eq('pandora_reference', reference)
    .single()

  return (data as Payment) ?? null
}

export interface InitiatePaymentResult {
  success: boolean
  reference?: string
  redirect_url?: string
  error?: string
}

export async function initiatePayment(bookingId: string, phoneNumber: string): Promise<InitiatePaymentResult> {
  const { data, error } = await supabase.functions.invoke('initiate-payment', {
    body: { booking_id: bookingId, phone_number: phoneNumber },
  })

  if (error) throw error
  return data as InitiatePaymentResult
}

export interface RefundResult {
  success: boolean
  message?: string
  error?: string
}

export async function requestRefund(
  bookingId: string,
  cancellationType: 'driver' | 'passenger'
): Promise<RefundResult> {
  const { data, error } = await supabase.functions.invoke('process-refund', {
    body: { booking_id: bookingId, cancellation_type: cancellationType },
  })

  if (error) throw error
  return data as RefundResult
}

// Subscribes to live updates for a single payment row. Returns an unsubscribe function.
export function subscribeToPaymentUpdates(paymentId: string, onUpdate: (payment: Payment) => void): () => void {
  const subscription = supabase
    .channel(`payment-${paymentId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'payments', filter: `id=eq.${paymentId}` },
      (payload) => onUpdate(payload.new as Payment)
    )
    .subscribe()

  return () => subscription.unsubscribe()
}
