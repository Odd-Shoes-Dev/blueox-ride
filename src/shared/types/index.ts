// Database types matching our Supabase schema

export type UserRole = 'passenger' | 'driver' | 'admin'

export type RideStatus = 'active' | 'full' | 'completed' | 'cancelled'

export type BookingStatus = 'pending_payment' | 'confirmed' | 'cancelled_by_passenger' | 'cancelled_by_driver' | 'completed'

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded'

export type PaymentType = 'booking_fee' | 'refund_to_passenger' | 'refund_to_driver'

export type CommissionStatus = 'pending' | 'paid'

// A passenger's request for a seat on a driver's ride (own pickup/drop-off and offer)
export type BookingRequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'
export type DeclineReason = 'offer_too_low' | 'pickup_too_far' | 'seats_reserved' | 'other'

export type RideRequestStatus = 'open' | 'matched' | 'cancelled' | 'expired'

export interface User {
  id: string
  email: string
  full_name: string
  phone_number: string | null
  avatar_url: string | null
  role: UserRole
  average_rating: number | null
  total_rides: number
  // When they agreed to the Terms and Privacy Policy, and which version. null = not yet.
  // (Absent altogether until migration 11 has been run.)
  terms_accepted_at?: string | null
  terms_version?: string | null
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

export interface BookingRequest {
  id: string
  ride_id: string
  ride?: Ride
  driver_id: string
  passenger_id: string
  passenger?: User
  seats: number
  // What the passenger offers per seat, in UGX
  offer_price: number
  pickup_name: string | null
  pickup_lat: number | null
  pickup_lng: number | null
  dropoff_name: string | null
  dropoff_lat: number | null
  dropoff_lng: number | null
  status: BookingRequestStatus
  decline_reason: DeclineReason | null
  // The driver asked not to get more requests from this person on this ride
  blocked: boolean
  attempt_no: number
  booking_id: string | null
  created_at: string
  responded_at: string | null
  expires_at: string
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
  // Set by the driver when the passenger gets in; a no-show is a booking the driver cancelled
  // because the passenger never turned up.
  picked_up_at?: string | null
  no_show?: boolean
  // Where they get in / off, when not the ride's own start and end (set for accepted requests)
  pickup_name?: string | null
  pickup_lat?: number | null
  pickup_lng?: number | null
  dropoff_name?: string | null
  dropoff_lat?: number | null
  dropoff_lng?: number | null
  // Price per seat that was agreed; null = the ride's listed price
  agreed_price?: number | null
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

export interface RideRequest {
  id: string
  passenger_id: string
  passenger?: User
  origin_name: string
  origin_lat: number
  origin_lng: number
  destination_name: string
  destination_lat: number
  destination_lng: number
  departure_time: string
  budget: number
  seats_needed: number
  notes: string | null
  status: RideRequestStatus
  matched_booking_id: string | null
  created_at: string
  updated_at: string
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

export interface PostRideRequestInput {
  origin_name: string
  origin_lat: number
  origin_lng: number
  destination_name: string
  destination_lat: number
  destination_lng: number
  departure_time: string
  budget: number
  seats_needed: number
  notes?: string
}

export interface AcceptRideRequestInput {
  departure_time: string
  price: number
  car_brand?: string | null
  car_model?: string | null
  car_year?: number | null
  car_photo_id?: string | null
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
