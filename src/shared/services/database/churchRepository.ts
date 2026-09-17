import { supabase } from './client'
import type { Church, ChurchCommissionSummary } from '@/shared/types'

export async function getChurchBySlug(slug: string): Promise<Pick<Church, 'id' | 'slug' | 'name'> | null> {
  const { data, error } = await supabase
    .from('churches')
    .select('id, slug, name')
    .eq('slug', slug.toLowerCase())
    .eq('is_active', true)
    .single()

  if (error || !data) return null
  return data
}

export async function getChurchCommissionSummaries(): Promise<ChurchCommissionSummary[]> {
  const { data, error } = await supabase
    .from('church_commission_summary')
    .select('*')
    .order('total_pending', { ascending: false })

  if (error) throw error
  return data as ChurchCommissionSummary[]
}

export interface CommissionWithDetails {
  id: string
  church_id: string
  booking_id: string
  ride_price: number
  booking_fee: number
  commission_amount: number
  status: 'pending' | 'paid'
  paid_at: string | null
  paid_by: string | null
  payment_reference: string | null
  notes: string | null
  created_at: string
  booking: {
    id: string
    created_at: string
    ride: { origin_name: string; destination_name: string; departure_time: string }
    passenger: { full_name: string }
  }
}

export async function getCommissionsForChurch(churchId: string): Promise<CommissionWithDetails[]> {
  const { data, error } = await supabase
    .from('church_commissions')
    .select(`
      *,
      booking:bookings(
        id,
        created_at,
        ride:rides(origin_name, destination_name, departure_time),
        passenger:users(full_name)
      )
    `)
    .eq('church_id', churchId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as CommissionWithDetails[]
}

export async function markCommissionPaid(
  commissionId: string,
  adminId: string,
  paymentReference: string | null,
  notes: string | null
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('mark_commission_paid', {
    p_commission_id: commissionId,
    p_admin_id: adminId,
    p_payment_reference: paymentReference,
    p_notes: notes,
  })
  return { error: error as Error | null }
}
