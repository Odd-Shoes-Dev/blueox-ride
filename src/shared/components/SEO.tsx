import { useEffect } from 'react'

interface SEOProps {
  title?: string
  description?: string
  keywords?: string
  image?: string
  url?: string
  type?: 'website' | 'article' | 'product'
  noIndex?: boolean
}

const BASE_URL = 'https://blueoxrides.com'
const DEFAULT_TITLE = 'BlueOx Rides - Affordable Carpooling & Rideshare in Uganda'
const DEFAULT_DESCRIPTION = "BlueOx Rides is Uganda's trusted carpooling platform. Share rides to Kampala, Jinja, Entebbe, Mbarara, Gulu and beyond. Save money, reduce traffic, travel safely with verified drivers."
const DEFAULT_IMAGE = `${BASE_URL}/assets/og-image.png`

export function SEO({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords,
  image = DEFAULT_IMAGE,
  url,
  type = 'website',
  noIndex = false,
}: SEOProps) {
  const fullTitle = title ? `${title} | BlueOx Rides` : DEFAULT_TITLE
  const fullUrl = url ? `${BASE_URL}${url}` : BASE_URL

  useEffect(() => {
    // Update title
    document.title = fullTitle

    // Helper to update or create meta tag
    const updateMeta = (name: string, content: string, isProperty = false) => {
      const attr = isProperty ? 'property' : 'name'
      let element = document.querySelector(`meta[${attr}="${name}"]`)
      if (!element) {
        element = document.createElement('meta')
        element.setAttribute(attr, name)
        document.head.appendChild(element)
      }
      element.setAttribute('content', content)
    }

    // Primary meta tags
    updateMeta('description', description)
    if (keywords) {
      updateMeta('keywords', keywords)
    }
    updateMeta('robots', noIndex ? 'noindex, nofollow' : 'index, follow')

    // Open Graph
    updateMeta('og:title', fullTitle, true)
    updateMeta('og:description', description, true)
    updateMeta('og:image', image, true)
    updateMeta('og:url', fullUrl, true)
    updateMeta('og:type', type, true)

    // Twitter Card
    updateMeta('twitter:title', fullTitle)
    updateMeta('twitter:description', description)
    updateMeta('twitter:image', image)
    updateMeta('twitter:url', fullUrl)

    // Update canonical
    let canonical = document.querySelector('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.setAttribute('rel', 'canonical')
      document.head.appendChild(canonical)
    }
    canonical.setAttribute('href', fullUrl)

    // Cleanup - reset to defaults when component unmounts
    return () => {
      document.title = DEFAULT_TITLE
    }
  }, [fullTitle, description, keywords, image, fullUrl, type, noIndex])

  return null
}

// Pre-configured SEO for common pages
export function HomePageSEO() {
  return (
    <SEO
      url="/"
      keywords="carpool Uganda, rideshare Kampala, affordable transport Uganda, share ride Kampala, carpooling app Uganda"
    />
  )
}

export function SearchPageSEO() {
  return (
    <SEO
      title="Search Rides"
      description="Find available carpooling rides across Uganda. Search by origin, destination, date and price. Book your seat today."
      url="/search"
      keywords="search rides Uganda, find carpool, available rides Kampala, book ride Uganda"
    />
  )
}

export function RideDetailsSEO({
  origin,
  destination,
  price,
  rideId
}: {
  origin: string
  destination: string
  price: number
  rideId: string
}) {
  const formattedPrice = new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    minimumFractionDigits: 0,
  }).format(price)

  return (
    <SEO
      title={`Ride from ${origin} to ${destination}`}
      description={`Carpool from ${origin} to ${destination} for ${formattedPrice} per seat. Book your seat now on BlueOx Rides.`}
      url={`/rides/${rideId}`}
      keywords={`${origin} to ${destination}, carpool ${origin}, ride to ${destination}, Uganda transport`}
      type="product"
    />
  )
}

export function ChurchPageSEO({
  churchName,
  slug
}: {
  churchName: string
  slug: string
}) {
  return (
    <SEO
      title={`${churchName} Carpooling`}
      description={`Find and share rides to ${churchName} services. Connect with your church community through BlueOx Rides carpooling.`}
      url={`/${slug}`}
      keywords={`${churchName} rides, church carpool Uganda, ${churchName} transport, Kampala church rides`}
    />
  )
}

export function LoginPageSEO() {
  return (
    <SEO
      title="Login"
      description="Login to your BlueOx Rides account to book rides and manage your trips."
      url="/login"
      noIndex={true}
    />
  )
}

export function RegisterPageSEO() {
  return (
    <SEO
      title="Register"
      description="Create your free BlueOx Rides account. Start finding affordable carpooling rides or offer your empty seats."
      url="/register"
      keywords="sign up BlueOx, register carpool Uganda, create account rideshare"
    />
  )
}

export function CreateRidePageSEO() {
  return (
    <SEO
      title="Offer a Ride"
      description="Share your empty seats and earn money. Post your ride on BlueOx Rides and connect with passengers going your way."
      url="/rides/create"
      keywords="offer ride Uganda, share seats Kampala, earn money driving, post carpool"
      noIndex={true}
    />
  )
}
