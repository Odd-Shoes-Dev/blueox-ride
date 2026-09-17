// Generic branding-override shape used by any page that supports a custom
// color scheme (currently HomePage, for church landing pages). Lives in
// shared/ — not domains/church/ — so core pages never need to import
// anything from the church domain just to type their own props.
export interface BrandColors {
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
