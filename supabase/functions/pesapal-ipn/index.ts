// Blue Ox - Pesapal IPN Handler
// Handles IPN notifications and updates payment status
// Documentation: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/gettransactionstatus

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseSecretKey = Deno.env.get('SUPABASE_SECRET_KEY')!
    const pesapalConsumerKey = Deno.env.get('PESAPAL_CONSUMER_KEY')!
    const pesapalConsumerSecret = Deno.env.get('PESAPAL_CONSUMER_SECRET')!

    const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey)

    let orderTrackingId: string | null = null
    let orderMerchantReference: string | null = null
    let orderNotificationType: string | null = null

    if (req.method === 'POST') {
      const payload = await req.json()
      orderTrackingId = payload?.OrderTrackingId || payload?.orderTrackingId
      orderMerchantReference = payload?.OrderMerchantReference || payload?.orderMerchantReference
      orderNotificationType = payload?.OrderNotificationType || payload?.orderNotificationType
    } else {
      const url = new URL(req.url)
      orderTrackingId = url.searchParams.get('OrderTrackingId')
      orderMerchantReference = url.searchParams.get('OrderMerchantReference')
      orderNotificationType = url.searchParams.get('OrderNotificationType')
    }

    if (!orderTrackingId || !orderMerchantReference) {
      throw new Error('Missing order tracking or merchant reference')
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('*, booking:bookings(*)')
      .eq('pandora_reference', orderMerchantReference)
      .single()

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({
          orderNotificationType: orderNotificationType || 'IPNCHANGE',
          orderTrackingId,
          orderMerchantReference,
          status: 200,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (payment.status === 'completed' || payment.status === 'refunded') {
      return new Response(
        JSON.stringify({
          orderNotificationType: orderNotificationType || 'IPNCHANGE',
          orderTrackingId,
          orderMerchantReference,
          status: 200,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    const token = await getPesapalToken(pesapalConsumerKey, pesapalConsumerSecret)
    const statusResponse = await fetch(
      `${PESAPAL_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`,
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

    const statusDescription = statusResult?.payment_status_description?.toUpperCase?.() || 'INVALID'

    if (statusDescription === 'COMPLETED') {
      await supabaseAdmin
        .from('payments')
        .update({
          status: 'completed',
          pandora_transaction_id: orderTrackingId,
        })
        .eq('id', payment.id)

      await supabaseAdmin
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', payment.booking_id)
    } else if (statusDescription === 'FAILED' || statusDescription === 'REVERSED' || statusDescription === 'INVALID') {
      await supabaseAdmin
        .from('payments')
        .update({
          status: 'failed',
          error_message: statusResult?.description || statusResult?.message || 'Payment failed',
          retry_count: payment.retry_count + 1,
        })
        .eq('id', payment.id)
    } else {
      await supabaseAdmin
        .from('payments')
        .update({
          status: 'processing',
          pandora_transaction_id: orderTrackingId,
        })
        .eq('id', payment.id)
    }

    return new Response(
      JSON.stringify({
        orderNotificationType: orderNotificationType || 'IPNCHANGE',
        orderTrackingId,
        orderMerchantReference,
        status: 200,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Pesapal IPN error:', error)
    return new Response(
      JSON.stringify({
        status: 500,
        message: error.message,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
