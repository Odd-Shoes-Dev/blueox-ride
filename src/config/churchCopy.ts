// Church-specific landing page copy configuration
// Includes brand colors, logos, and hero text customization

export interface ChurchBrandColors {
  // Primary brand color - used for hero background gradient
  primary: string
  primaryDark: string
  // Accent color - used for highlights, buttons, icons
  accent: string
  accentLight: string
  // Text colors for the hero section
  heroText: string
  heroSubtext: string
}

export interface ChurchCopy {
  slug: string
  churchName: string
  heroHeadline: string
  heroSubtext: string
  // Optional: customize the logged-in user prompt
  loggedInPrompt?: string
  // Brand colors for theming
  brandColors: ChurchBrandColors
  // Church logo URL (optional - displayed in hero section)
  logoUrl?: string
}

// Default BlueOx brand colors (coral and navy)
export const defaultBrandColors: ChurchBrandColors = {
  primary: '#193153',      // Navy 900
  primaryDark: '#0f1d31',  // Navy 950
  accent: '#FF4040',       // Coral 500
  accentLight: '#ffe0e0',  // Coral 100
  heroText: '#ffffff',
  heroSubtext: '#ffe0e0',  // Coral 100
}

export const churchCopyMap: Record<string, ChurchCopy> = {
  // Watoto Church - Navy blue with orange/gold accents
  // Based on their official branding: dark blue logo with warm accent colors
  // "Celebrating Christ, Caring for Community" - Kampala, Uganda
  watoto: {
    slug: 'watoto',
    churchName: 'Watoto Church',
    heroHeadline: 'Ride together to Watoto Church',
    heroSubtext: 'Find fellow believers heading to service. Save money, build community.',
    logoUrl: 'https://watotochurch.com/wp-content/uploads/2020/02/watotologob.png',
    brandColors: {
      primary: '#1E3A5F',       // Watoto Navy Blue
      primaryDark: '#142942',   // Darker navy
      accent: '#F5A623',        // Watoto Orange/Gold
      accentLight: '#FEF3DC',   // Light orange
      heroText: '#ffffff',
      heroSubtext: '#FEF3DC',
    },
  },

  // Worship Harvest - Orange/amber with dark navy
  // Led by Apostle Moses Mukisa - "Gospel, Discipleship, Mission"
  // Based on their website: warm orange tones, community-focused
  worshipharvest: {
    slug: 'worshipharvest',
    churchName: 'Worship Harvest',
    heroHeadline: 'Ride together to Worship Harvest',
    heroSubtext: 'Connect with church members going your way. Travel together, worship together.',
    logoUrl: '/assets/worship-harvest-logo.png',
    brandColors: {
      primary: '#E87722',       // Worship Harvest Orange
      primaryDark: '#C65A0A',   // Darker orange
      accent: '#1A3A5C',        // Dark Navy accent
      accentLight: '#FFF3E8',   // Light orange cream
      heroText: '#ffffff',
      heroSubtext: '#FFF3E8',
    },
  },

  // Holy City Church (Entebbe) - Green/teal with gold accents
  // Led by Professor Ronnie Makabai - "The Paradise of God"
  // Located at Lake Victoria Peninsula, Kawuku Bwerenga, Entebbe
  holycity: {
    slug: 'holycity',
    churchName: 'Holy City Church',
    heroHeadline: 'Share rides to Holy City Church',
    heroSubtext: 'Join other members heading to service. Affordable, trusted carpooling.',
    // Bro Ronnie Ministries logo - green/teal theme matching their site
    brandColors: {
      primary: '#1B5E4B',       // Holy City Teal/Green
      primaryDark: '#134236',   // Darker green
      accent: '#C9A227',        // Gold
      accentLight: '#F5F9F7',   // Light green tint
      heroText: '#ffffff',
      heroSubtext: '#E8F5E9',
    },
  },

  // Miracle Centre Cathedral - Royal blue with gold
  // Founded by Pastor Robert Kayanja - One of East Africa's largest churches
  // Located in Rubaga Division, Kampala - seats 10,500
  miraclecenter: {
    slug: 'miraclecenter',
    churchName: 'Miracle Centre Cathedral',
    heroHeadline: 'Get to Miracle Centre together',
    heroSubtext: 'Find rides with fellow believers. Save on transport, grow in fellowship.',
    logoUrl: 'https://images.squarespace-cdn.com/content/v1/61b8afd40030027b2b7b4629/a7484434-03f6-4ba5-bb20-245e5e63e66e/rk.png',
    brandColors: {
      primary: '#1E4D8C',       // Royal Blue
      primaryDark: '#153764',   // Darker blue
      accent: '#FFD700',        // Gold
      accentLight: '#FFFDE7',   // Light gold
      heroText: '#ffffff',
      heroSubtext: '#FFFDE7',
    },
  },

  // Phaneroo Ministries - Maroon/burgundy with gold
  // Led by Apostle Grace Lubega - "Make Manifest"
  // Vision: Transform nations with the Word of God
  phaneroo: {
    slug: 'phaneroo',
    churchName: 'Phaneroo Ministries',
    heroHeadline: 'Ride together to Phaneroo',
    heroSubtext: 'Connect with others heading to the gathering. Share the journey, share the cost.',
    logoUrl: 'https://phaneroo.org/wp-content/uploads/2018/02/Phaneroo_logo-2.png',
    brandColors: {
      primary: '#6B2D5B',       // Phaneroo Maroon/Burgundy
      primaryDark: '#4A1F3F',   // Darker burgundy
      accent: '#D4A853',        // Gold
      accentLight: '#FBF5E8',   // Light cream gold
      heroText: '#ffffff',
      heroSubtext: '#FBF5E8',
    },
  },
}

// Default copy for unknown slugs or main landing page
export const defaultCopy: ChurchCopy = {
  slug: '',
  churchName: '',
  heroHeadline: 'Travel together, pay less',
  heroSubtext: 'Find trusted drivers going your way across Uganda',
  brandColors: defaultBrandColors,
}

export function getChurchCopy(slug: string | undefined): ChurchCopy {
  if (!slug) return defaultCopy
  return churchCopyMap[slug.toLowerCase()] || defaultCopy
}
