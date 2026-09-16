// Blue Ox - Process Refund Edge Function
// Handles refunds based on cancellation rules:
// - Driver cancels → refund 10% to passenger
// - Passenger cancels > 1 hour before ride → refund 10% to passenger
// - Passenger cancels <= 1 hour before ride → refund 10% to driver

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RefundRequest {
  booking_id: string
  cancellation_type: 'passenger' | 'driver'
}

const PESAPAL_BASE_URL = Deno.env.get('PESAPAL_BASE_URL') || 'https://pay.pesapal.com/v3'

async function getPesapalToken(consumerKey: string, consumerSecret: string) {
  const response = await fetch(`${PESAPAL_BASE_URL}/api/Auth/RequestToken`, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    }),
  })

  const result = await response.json()
  if (!response.ok || !result?.token) {
    throw new Error(result?.message || 'Failed to authenticate with Pesapal')
  }

  return result.token as string
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseSecretKey = Deno.env.get('SUPABASE_SECRET_KEY')!
    const supabasePublishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!
    const pesapalConsumerKey = Deno.env.get('PESAPAL_CONSUMER_KEY')!
    const pesapalConsumerSecret = Deno.env.get('PESAPAL_CONSUMER_SECRET')!

    const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey)
    const supabaseClient = createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    const { booking_id, cancellation_type }: RefundRequest = await req.json()

    if (!booking_id || !cancellation_type) {
      throw new Error('Missing required fields')
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        ride:rides (
          id,
          price,
          departure_time,
          driver_id
        ),
        payment:payments (
          id,
          amount,
          status,
          phone_number,
          pandora_transaction_id
        )
      `)
      .eq('id', booking_id)
      .eq('status', 'confirmed')
      .single()

    if (bookingError || !booking) {
      throw new Error('Confirmed booking not found')
    }

    const isDriver = booking.ride.driver_id === user.id
    const isPassenger = booking.passenger_id === user.id

    if (cancellation_type === 'driver' && !isDriver) {
      throw new Error('Only the driver can cancel as driver')
    }
    if (cancellation_type === 'passenger' && !isPassenger) {
      throw new Error('Only the passenger can cancel as passenger')
    }

    const originalPayment = booking.payment?.find((p: any) =>
      p.status === 'completed' && p.amount > 0
    )

    if (!originalPayment) {
      throw new Error('No completed payment found for this booking')
    }

    if (!originalPayment.pandora_transaction_id) {
      throw new Error('Missing Pesapal order tracking ID for refund')
    }

    const departureTime = new Date(booking.ride.departure_time)
    const now = new Date()
    const hoursUntilDeparture = (departureTime.getTime() - now.getTime()) / (1000 * 60 * 60)

    let refundTo: 'passenger' | 'driver'
    let refundType: 'refund_to_passenger' | 'refund_to_driver'

    if (cancellation_type === 'driver') {
      refundTo = 'passenger'
      refundType = 'refund_to_passenger'
    } else {
      if (hoursUntilDeparture > 1) {
        refundTo = 'passenger'
        refundType = 'refund_to_passenger'
      } else {
        refundTo = 'driver'
        refundType = 'refund_to_driver'
      }
    }

    let recipientPhone: string
    let recipientId: string

    if (refundTo === 'passenger') {
      recipientPhone = originalPayment.phone_number
      recipientId = booking.passenger_id
    } else {
      const { data: driver, error: driverError } = await supabaseAdmin
        .from('users')
        .select('phone_number')
        .eq('id', booking.ride.driver_id)
        .single()

      if (driverError || !driver?.phone_number) {
        throw new Error('Driver phone number not found. Please contact support.')
      }
      recipientPhone = driver.phone_number
      recipientId = booking.ride.driver_id
    }

    const refundReference = `BO-REFUND-${Date.now()}-${booking_id.substring(0, 8)}`

    const { data: refundPayment, error: refundPaymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        booking_id: booking_id,
        user_id: recipientId,
        amount: originalPayment.amount,
        payment_type: refundType,
        status: 'pending',
        pandora_reference: refundReference,
        phone_number: recipientPhone,
      })
      .select()
      .single()

    if (refundPaymentError) {
      console.error('Refund payment creation error:', refundPaymentError)
      throw new Error('Failed to create refund record')
    }

    const token = await getPesapalToken(pesapalConsumerKey, pesapalConsumerSecret)
    const statusResponse = await fetch(
      `${PESAPAL_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(originalPayment.pandora_transaction_id)}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      }
    )

    const statusResult = await statusResponse.json()
    if (!statusResponse.ok || statusResult?.status !== '200') {
      throw new Error(statusResult?.message || 'Failed to fetch Pesapal transaction status')
    }

    if (statusResult?.payment_status_description?.toUpperCase?.() !== 'COMPLETED') {
      throw new Error('Only completed payments can be refunded')
    }

    const confirmationCode = statusResult?.confirmation_code
    if (!confirmationCode) {
      throw new Error('Missing confirmation code required for refund')
    }

    const refundResponse = await fetch(`${PESAPAL_BASE_URL}/api/Transactions/RefundRequest`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        confirmation_code: confirmationCode,
        amount: originalPayment.amount,
        username: user.email || user.id,
        remarks: `Blue Ox refund - Booking cancellation (${refundTo})`,
      }),
    })

    const refundResult = await refundResponse.json()
    if (!refundResponse.ok || refundResult?.status !== '200') {
      await supabaseAdmin
        .from('payments')
        .update({
          status: 'failed',
          error_message: refundResult?.message || 'Refund initiation failed',
        })
        .eq('id', refundPayment.id)

      throw new Error(refundResult?.message || 'Refund initiation failed')
    }

    await supabaseAdmin
      .from('payments')
      .update({
        status: 'processing',
        pandora_transaction_id: confirmationCode,
      })
      .eq('id', refundPayment.id)

    const newStatus = cancellation_type === 'driver' ? 'cancelled_by_driver' : 'cancelled_by_passenger'
    await supabaseAdmin
      .from('bookings')
      .update({ status: newStatus })
      .eq('id', booking_id)

    await supabaseAdmin
      .from('payments')
      .update({ status: 'refunded' })
      .eq('id', originalPayment.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Refund initiated. ${refundTo === 'passenger' ? 'The passenger' : 'The driver'} will receive UGX ${originalPayment.amount.toLocaleString()} on ${recipientPhone}`,
        refund_to: refundTo,
        amount: originalPayment.amount,
        reference: refundReference,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Refund processing error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
