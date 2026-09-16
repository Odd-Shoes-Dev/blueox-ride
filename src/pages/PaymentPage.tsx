import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase, withTimeout, RequestTimeoutError } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/utils'
import type { Booking, Ride, Payment } from '@/types'
import { ArrowLeft, Smartphone, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'

interface BookingWithRide extends Booking {
  ride: Ride
}

export default function PaymentPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [booking, setBooking] = useState<BookingWithRide | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [phoneNumber, setPhoneNumber] = useState((location.state as { phone?: string })?.phone || '')
  const [loading, setLoading] = useState(true)
  const [initiating, setInitiating] = useState(false)
  const [checking, setChecking] = useState(false)
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null)

  const fetchInProgress = useRef(false)

  const fetchBooking = useCallback(async () => {
    // Prevent concurrent fetches
    if (fetchInProgress.current || !id) return
    fetchInProgress.current = true

    setLoading(true)

    try {
      const { data, error } = await withTimeout(
        supabase
          .from('bookings')
          .select(`
            *,
            ride:rides(*)
          `)
          .eq('id', id)
          .single(),
        15000
      )

      if (error || !data) {
        console.error('Fetch booking error:', error)
        toast({
          title: 'Booking not found',
          variant: 'destructive',
        })
        navigate('/')
        return
      }

      if (data.passenger_id !== user?.id) {
        toast({
          title: 'Unauthorized',
          description: 'This is not your booking.',
          variant: 'destructive',
        })
        navigate('/')
        return
      }

      setBooking(data as BookingWithRide)

      // Check for existing payment with timeout
      const { data: paymentData } = await withTimeout(
        supabase
          .from('payments')
          .select('*')
          .eq('booking_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
        10000
      )

      if (paymentData) {
        setPayment(paymentData as Payment)
        if (paymentData.phone_number) {
          setPhoneNumber(paymentData.phone_number)
        }
      }
    } catch (err) {
      if (err instanceof RequestTimeoutError) {
        console.error('Fetch booking timed out')
        toast({
          title: 'Request timed out',
          description: 'Please try again.',
          variant: 'destructive',
        })
      } else {
        console.error('Fetch booking error:', err)
      }
    } finally {
      setLoading(false)
      fetchInProgress.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]) // Only depend on id - toast/navigate are stable

  useEffect(() => {
    if (id && user?.id) {
      fetchBooking()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]) // Only re-fetch when id or user changes

  // Real-time subscription for payment status updates
  useEffect(() => {
    if (!payment?.id) return

    // Subscribe to payment changes
    const subscription = supabase
      .channel(`payment-${payment.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payments',
          filter: `id=eq.${payment.id}`,
        },
        async (payload) => {
          console.log('Payment update received:', payload.new)
          const newPayment = payload.new as Payment

          setPayment(newPayment)

          if (newPayment.status === 'completed') {
            toast({
              title: 'Payment successful!',
              description: 'Your booking is confirmed. You can now contact the driver.',
              variant: 'success',
            })
            // Refresh booking status
            fetchInProgress.current = false // Allow refetch
            await fetchBooking()
          } else if (newPayment.status === 'failed') {
            toast({
              title: 'Payment failed',
              description: newPayment.error_message || 'Please try again.',
              variant: 'destructive',
            })
          }
        }
      )
      .subscribe()

    // Also poll as fallback (every 10 seconds)
    const interval = payment.status === 'processing'
      ? setInterval(checkPaymentStatus, 10000)
      : null

    return () => {
      subscription.unsubscribe()
      if (interval) clearInterval(interval)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.id, payment?.status]) // Remove fetchBooking dep

  const checkPaymentStatus = async () => {
    if (!payment) return

    setChecking(true)
    try {
      const { data } = await withTimeout(
        supabase
          .from('payments')
          .select('*')
          .eq('id', payment.id)
          .single(),
        10000
      )

      if (data) {
        setPayment(data as Payment)
        if (data.status === 'completed') {
          toast({
            title: 'Payment successful!',
            description: 'Your booking is confirmed. You can now contact the driver.',
            variant: 'success',
          })
          // Refresh booking status - await it!
          await fetchBooking()
        } else if (data.status === 'failed') {
          toast({
            title: 'Payment failed',
            description: data.error_message || 'Please try again.',
            variant: 'destructive',
          })
        }
      }
    } catch (err) {
      if (err instanceof RequestTimeoutError) {
        console.error('Payment status check timed out')
      } else {
        console.error('Error checking payment status:', err)
      }
    } finally {
      setChecking(false)
    }
  }

  const initiatePayment = async () => {
    if (!booking || !user) return

    // Validate phone
    const phoneRegex = /^(\+256|0)?[7-9]\d{8}$/
    if (!phoneRegex.test(phoneNumber.replace(/\s/g, ''))) {
      toast({
        title: 'Invalid phone number',
        description: 'Please enter a valid Uganda mobile money number.',
        variant: 'destructive',
      })
      return
    }

    setInitiating(true)

    try {
      // Call edge function to initiate payment
      const { data, error } = await supabase.functions.invoke('initiate-payment', {
        body: {
          booking_id: booking.id,
          phone_number: phoneNumber,
        },
      })

      if (error) throw error

      if (data.success) {
        toast({
          title: 'Payment initiated',
          description: 'Redirecting you to Pesapal to complete payment.',
          variant: 'success',
        })

        // Fetch the created payment
        const { data: paymentData } = await supabase
          .from('payments')
          .select('*')
          .eq('pandora_reference', data.reference)
          .single()

        if (paymentData) {
          setPayment(paymentData as Payment)
        }

        if (data.redirect_url) {
          setRedirectUrl(data.redirect_url)
          window.location.assign(data.redirect_url)
        }
      } else {
        throw new Error(data.error || 'Payment initiation failed')
      }
    } catch (error: any) {
      console.error('Payment error:', error)
      toast({
        title: 'Payment failed',
        description: error.message || 'An error occurred. Please try again.',
        variant: 'destructive',
      })
    }

    setInitiating(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!booking) return null

  // If booking is already confirmed, redirect to ride details
  if (booking.status === 'confirmed') {
    return (
      <div className="min-h-screen bg-background pb-8">
        <div className="bg-green-600 pt-12 pb-20 px-4">
          <div className="max-w-lg mx-auto text-center">
            <CheckCircle className="w-16 h-16 text-white mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-white">Booking Confirmed!</h1>
            <p className="text-green-100 mt-2">
              Your payment was successful.
            </p>
          </div>
        </div>

        <div className="px-4 -mt-12">
          <Card className="max-w-lg mx-auto">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground mb-4">
                You can now contact the driver and coordinate your pickup.
              </p>
              <Button className="w-full" onClick={() => navigate(`/rides/${booking.ride_id}`)}>
                View Ride Details
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="bg-navy-900 pt-12 pb-6 px-4">
        <div className="max-w-lg mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-white/80 hover:text-white mb-4"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Back
          </button>
          <h1 className="text-xl font-semibold text-white">Complete Payment</h1>
        </div>
      </div>

      <div className="px-4 mt-6">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Booking Summary */}
          <Card>
            <CardContent className="p-5">
              <h3 className="font-medium mb-3">Booking Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Route</span>
                  <span className="text-right">
                    {booking.ride.origin_name} → {booking.ride.destination_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Seats</span>
                  <span>{booking.seats_booked}</span>
                </div>
                <div className="flex justify-between font-medium pt-2 border-t">
                  <span>Booking fee</span>
                  <span className="text-navy-900">{formatCurrency(booking.booking_fee)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Status */}
          {payment?.status === 'processing' && (
            <Card className="border-yellow-500 bg-yellow-50">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-6 h-6 text-yellow-600 animate-spin" />
                  <div>
                    <p className="font-medium text-yellow-800">Processing Payment</p>
                    <p className="text-sm text-yellow-700">
                      Waiting for Pesapal confirmation on {payment.phone_number}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full mt-4"
                  onClick={checkPaymentStatus}
                  loading={checking}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Check Status
                </Button>
              </CardContent>
            </Card>
          )}

          {payment?.status === 'failed' && (
            <Card className="border-destructive bg-red-50">
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <XCircle className="w-6 h-6 text-destructive" />
                  <div>
                    <p className="font-medium text-red-800">Payment Failed</p>
                    <p className="text-sm text-red-700">
                      {payment.error_message || 'The transaction was not completed.'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payment Form */}
          {(!payment || payment.status === 'failed' || payment.status === 'pending') && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-coral-100 flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-navy-900" />
                  </div>
                  <div>
                    <p className="font-medium">Pesapal Checkout</p>
                    <p className="text-sm text-muted-foreground">Mobile money and cards</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Mobile Money Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="07XX XXX XXX"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter a number for payment confirmation and receipts
                    </p>
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={initiatePayment}
                    loading={initiating}
                  >
                    Pay {formatCurrency(booking.booking_fee)}
                  </Button>
                  {redirectUrl && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => window.location.assign(redirectUrl)}
                    >
                      Continue to Pesapal
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Info */}
          <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-2">What happens next?</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>You'll be redirected to Pesapal to choose a payment method</li>
              <li>Complete the payment and return to this page</li>
              <li>Once confirmed, you'll get the driver's contact</li>
              <li>Pay {formatCurrency(booking.ride.price - booking.booking_fee / booking.seats_booked)} per seat in cash to the driver after the ride</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
