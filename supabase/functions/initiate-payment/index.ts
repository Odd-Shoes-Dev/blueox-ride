// Blue Ox - Initiate Payment Edge Function
// This function handles payment initiation with Pesapal API 3.0
// Documentation: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/submitorderrequest

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PaymentRequest {
  booking_id: string
  phone_number: string
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
    const pesapalIpnId = Deno.env.get('PESAPAL_IPN_ID')!

    if (!pesapalConsumerKey || !pesapalConsumerSecret) {
      throw new Error('Pesapal credentials are not configured')
    }

    if (!pesapalIpnId) {
      throw new Error('PESAPAL_IPN_ID is not configured')
    }

    const appBaseUrl = Deno.env.get('APP_BASE_URL') || req.headers.get('origin') || req.headers.get('referer')
    if (!appBaseUrl) {
      throw new Error('APP_BASE_URL is not configured')
    }
    let normalizedBaseUrl = appBaseUrl
    try {
      normalizedBaseUrl = new URL(appBaseUrl).origin
    } catch {
      normalizedBaseUrl = appBaseUrl.replace(/\/$/, '')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey)
    const supabaseClient = createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    const { booking_id, phone_number }: PaymentRequest = await req.json()

    if (!booking_id || !phone_number) {
      throw new Error('Missing required fields: booking_id and phone_number')
    }

    // Validate phone number format (Uganda: +256 or 0 followed by 7 or 9 digits)
    const phoneRegex = /^(\+256|256|0)?[7-9]\d{8}$/
    const cleanPhone = phone_number.replace(/\s/g, '')
    if (!phoneRegex.test(cleanPhone)) {
      throw new Error('Invalid phone number format. Use Uganda format: 07XXXXXXXX or 256XXXXXXXXX')
    }

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select(`
        *,
        ride:rides (
          id,
          price,
          departure_time,
          origin_name,
          destination_name,
          driver_id
        )
      `)
      .eq('id', booking_id)
      .single()

    if (bookingError || !booking) {
      throw new Error('Booking not found')
    }

    if (booking.passenger_id !== user.id) {
      throw new Error('You can only pay for your own bookings')
    }

    if (booking.status !== 'pending_payment') {
      throw new Error(`Cannot process payment. Booking status is: ${booking.status}`)
    }

    if (new Date(booking.ride.departure_time) < new Date()) {
      throw new Error('Cannot pay for a ride that has already departed')
    }

    const bookingFee = Math.ceil(booking.ride.price * 0.1 * booking.seats_booked)

    const merchantReference = `BO-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .insert({
        booking_id: booking_id,
        user_id: user.id,
        amount: bookingFee,
        payment_type: 'booking_fee',
        status: 'pending',
        pandora_reference: merchantReference,
        phone_number: cleanPhone,
      })
      .select()
      .single()

    if (paymentError) {
      console.error('Payment creation error:', paymentError)
      throw new Error('Failed to create payment record')
    }

    if (booking.booking_fee !== bookingFee) {
      await supabaseAdmin
        .from('bookings')
        .update({ booking_fee: bookingFee })
        .eq('id', booking_id)
    }

    const token = await getPesapalToken(pesapalConsumerKey, pesapalConsumerSecret)

    const callbackUrl = `${normalizedBaseUrl.replace(/\/$/, '')}/bookings/${booking_id}/pay`
    const orderPayload = {
      id: merchantReference,
      currency: 'UGX',
      amount: bookingFee,
      description: `Blue Ox booking fee: ${booking.ride.origin_name} → ${booking.ride.destination_name}`,
      callback_url: callbackUrl,
      notification_id: pesapalIpnId,
      billing_address: {
        phone_number: cleanPhone,
        email_address: user.email,
        country_code: 'UG',
        first_name: user.user_metadata?.full_name || '',
        last_name: '',
      },
    }

    const pesapalResponse = await fetch(`${PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(orderPayload),
    })

    const pesapalResult = await pesapalResponse.json()
    if (!pesapalResponse.ok || pesapalResult?.status !== '200') {
      await supabaseAdmin
        .from('payments')
        .update({
          status: 'failed',
          error_message: pesapalResult?.message || 'Pesapal payment initiation failed',
        })
        .eq('id', payment.id)

      throw new Error(pesapalResult?.message || 'Pesapal payment initiation failed')
    }

    await supabaseAdmin
      .from('payments')
      .update({
        status: 'processing',
        pandora_transaction_id: pesapalResult.order_tracking_id,
      })
      .eq('id', payment.id)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Payment initiated. Redirecting to Pesapal.',
        payment_id: payment.id,
        reference: merchantReference,
        order_tracking_id: pesapalResult.order_tracking_id,
        redirect_url: pesapalResult.redirect_url,
        amount: bookingFee,
        phone_number: cleanPhone,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Payment initiation error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An unexpected error occurred',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
