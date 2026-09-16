// Database types matching our Supabase schema

export type UserRole = 'passenger' | 'driver' | 'admin'

export type RideStatus = 'active' | 'full' | 'completed' | 'cancelled'

export type BookingStatus = 'pending_payment' | 'confirmed' | 'cancelled_by_passenger' | 'cancelled_by_driver' | 'completed'

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded'

export type PaymentType = 'booking_fee' | 'refund_to_passenger' | 'refund_to_driver'

export type CommissionStatus = 'pending' | 'paid'

export interface User {
  id: string
  email: string
  full_name: string
  phone_number: string | null
  avatar_url: string | null
  role: UserRole
  average_rating: number | null
  total_rides: number
  created_at: string
  updated_at: string
}

export interface Ride {
  id: string
  driver_id: string
  driver?: User
  origin_name: string
  origin_lat: number
  origin_lng: number
  destination_name: string
  destination_lat: number
  destination_lng: number
  departure_time: string
  price: number
  available_seats: number
  total_seats: number
  status: RideStatus
  distance_km: number | null
  duration_minutes: number | null
  notes: string | null
  car_photo_id: string | null
  car_photo?: CarPhoto
  car_brand: string | null
  car_model: string | null
  car_year: number | null
  created_at: string
  updated_at: string
}

export interface CarPhoto {
  id: string
  driver_id: string
  photo_url: string
  caption: string | null
  is_primary: boolean
  created_at: string
}

export interface Church {
  id: string
  slug: string
  name: string
  contact_email: string | null
  contact_phone: string | null
  mobile_money_number: string | null
  mobile_money_name: string | null
  is_active: boolean
  total_commission_earned: number
  total_commission_paid: number
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  ride_id: string
  ride?: Ride
  passenger_id: string
  passenger?: User
  seats_booked: number
  booking_fee: number
  status: BookingStatus
  church_id: string | null
  church?: Church
  created_at: string
  updated_at: string
}

export interface ChurchCommission {
  id: string
  church_id: string
  church?: Church
  booking_id: string
  booking?: Booking
  ride_price: number
  booking_fee: number
  commission_amount: number
  status: CommissionStatus
  paid_at: string | null
  paid_by: string | null
  payment_reference: string | null
  notes: string | null
  created_at: string
}

export interface ChurchCommissionSummary {
  id: string
  slug: string
  name: string
  contact_email: string | null
  mobile_money_number: string | null
  mobile_money_name: string | null
  is_active: boolean
  total_bookings: number
  total_earned: number
  total_paid: number
  total_pending: number
}

export interface Payment {
  id: string
  booking_id: string
  booking?: Booking
  user_id: string
  amount: number
  payment_type: PaymentType
  status: PaymentStatus
  pandora_reference: string | null
  pandora_transaction_id: string | null
  phone_number: string
  error_message: string | null
  retry_count: number
  created_at: string
  updated_at: string
}

export interface Review {
  id: string
  booking_id: string
  booking?: Booking
  reviewer_id: string
  reviewer?: User
  reviewee_id: string
  reviewee?: User
  rating: number
  comment: string | null
  created_at: string
}

// API request/response types
export interface CreateRideRequest {
  origin_name: string
  origin_lat: number
  origin_lng: number
  destination_name: string
  destination_lat: number
  destination_lng: number
  departure_time: string
  price: number
  total_seats: number
  notes?: string
  car_brand?: string | null
  car_model?: string | null
  car_year?: number | null
}

export interface SearchRidesParams {
  origin_lat?: number
  origin_lng?: number
  destination_lat?: number
  destination_lng?: number
  date?: string
  min_seats?: number
  max_price?: number
}

export interface InitiatePaymentRequest {
  booking_id: string
  phone_number: string
}

export interface PesapalIpnPayload {
  OrderNotificationType: 'IPNCHANGE' | 'CALLBACKURL'
  OrderTrackingId: string
  OrderMerchantReference: string
}

// Google Maps types
export interface PlaceResult {
  name: string
  lat: number
  lng: number
  formatted_address: string
}

export interface DirectionsResult {
  distance_km: number
  duration_minutes: number
  polyline?: string
}
