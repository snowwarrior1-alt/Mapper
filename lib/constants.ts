/**
 * Shared constants — import from here rather than hardcoding values in components.
 */

// ── Debounce delays (ms) ──────────────────────────────────────────────────────

/** How long to wait after the last keystroke before firing a query */
export const DEBOUNCE_MS = {
  /** Nominatim geocoding — stay comfortably under the 1 req/s rate limit */
  geocode: 500,
  /** Cmd+K pin/community search — snappy */
  pinSearch: 200,
  /** Duplicate community name check */
  similarity: 350,
  /** Username search in mod / member pickers */
  userSearch: 300,
} as const

// ── Supabase Storage ──────────────────────────────────────────────────────────

export const BUCKETS = {
  pinPhotos: 'pin-photos',
} as const

// ── Hard limits ───────────────────────────────────────────────────────────────

export const LIMITS = {
  photosPerPin: 5,
  /** Max results returned by the Cmd+K pin search */
  pinSearchResults: 5,
  /** Max results returned by username searches */
  userSearchResults: 10,
  /** Max similar communities shown in the duplicate warning */
  similarCommunities: 5,
  /** Max geocoding results from Nominatim */
  geocodeResults: 5,
} as const

// ── Z-index ladder ────────────────────────────────────────────────────────────
// Leaflet's internal maximum is ~1000.
// Use these VALUES when you need to reference them in JS (e.g. inline styles).
// For Tailwind arbitrary classes keep the literal: z-[1001], z-[1002], etc.

export const Z_INDEX = {
  /** Hamburger button, LocationSearch, modal backdrops — above Leaflet */
  mapOverlay: 1001,
  /** Sidebar drawer — above the backdrop */
  sidebar: 1002,
  /** CreateCommunityModal / AuthModal / PinDetailModal overlays */
  modal: 1000,
  /** CommunitySettingsModal — needs to sit above other modals */
  settingsModal: 2000,
} as const
