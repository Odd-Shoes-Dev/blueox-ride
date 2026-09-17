import { supabase } from './client'
import type { Review } from '@/shared/types'

export async function createReview(
  reviewerId: string,
  revieweeId: string,
  bookingId: string,
  rating: number,
  comment?: string
): Promise<Review> {
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      booking_id: bookingId,
      reviewer_id: reviewerId,
      reviewee_id: revieweeId,
      rating,
      comment: comment || null,
    })
    .select()
    .single()

  if (error) throw error
  return data as Review
}

// All reviews the given user has already left, as reviewer — used to know
// which completed bookings still need a "leave a review" prompt without an
// extra query per booking.
export async function getMyReviewsAsReviewer(reviewerId: string): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('reviewer_id', reviewerId)

  if (error) throw error
  return data as Review[]
}
