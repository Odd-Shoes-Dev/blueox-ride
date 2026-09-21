// Facts shared by the Privacy Policy and Terms of Use. Keep these in one place so
// a change of address, contact email or "last updated" date is a one-line edit.

export const LEGAL = {
  serviceName: 'Blue OX Rides',
  website: 'https://blueoxrides.com',
  supportEmail: 'support@blueoxrides.com',
  location: 'Kampala, Uganda',
  // Bump this whenever either document changes in a way users should know about.
  lastUpdated: '21 September 2026',
  // The version of the documents people agree to, saved with their account (users.terms_version).
  // Change it ONLY when everyone must agree again (a material change). A different value here
  // shows every signed-in user the "agree to continue" screen once more.
  consentVersion: '2026-09-19',
  minimumAge: 18,
  // Share of the ride price paid online to reserve a seat (the rest is paid in cash to the driver).
  bookingFeePercent: 10,
  // Passengers who cancel later than this before departure forfeit the booking fee to the driver.
  freeCancellationHours: 1,
} as const
