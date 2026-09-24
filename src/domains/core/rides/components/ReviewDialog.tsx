import { useState } from 'react'
import { Button } from '@/shared/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog'
import { Label } from '@/shared/ui/label'
import { useToast } from '@/shared/hooks/use-toast'
import { reviewsRepository } from '@/shared/services/database'
import { Star } from 'lucide-react'
import { cn, getErrorMessage } from '@/shared/lib/utils'

interface ReviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  revieweeId: string
  revieweeName: string
  reviewerId: string
  onSubmitted: () => void
}

export function ReviewDialog({
  open,
  onOpenChange,
  bookingId,
  revieweeId,
  revieweeName,
  reviewerId,
  onSubmitted,
}: ReviewDialogProps) {
  const { toast } = useToast()
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (rating === 0) {
      toast({
        title: 'Please select a rating',
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      await reviewsRepository.createReview(reviewerId, revieweeId, bookingId, rating, comment || undefined)
      toast({
        title: 'Review submitted',
        description: `Thanks for rating ${revieweeName}.`,
        variant: 'success',
      })
      setRating(0)
      setComment('')
      onOpenChange(false)
      onSubmitted()
    } catch (error) {
      console.error('Submit review error:', error)
      toast({
        title: 'Failed to submit review',
        description: getErrorMessage(error),
        variant: 'destructive',
      })
    }
    setSubmitting(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rate {revieweeName}</DialogTitle>
          <DialogDescription>
            How was your experience? This helps build trust in the community.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="p-1"
              >
                <Star
                  className={cn(
                    'w-8 h-8 transition-colors',
                    (hoverRating || rating) >= star
                      ? 'text-yellow-500 fill-yellow-500'
                      : 'text-muted-foreground'
                  )}
                />
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="comment">Comment (optional)</Label>
            <textarea
              id="comment"
              className="flex min-h-[80px] w-full rounded-lg border border-input bg-background px-4 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Share more about your experience"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            Submit Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
