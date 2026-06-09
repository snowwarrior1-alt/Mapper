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

// ── Site admin ────────────────────────────────────────────────────────────────

/** The one user who can delete any community regardless of ownership.
 *  Must also exist in the `site_admins` table for RLS to actually grant it. */
export const ADMIN_USER_ID = process.env.NEXT_PUBLIC_ADMIN_USER_ID ?? ''

// Z-index layering is documented in CLAUDE.md (map controls 1100 → sidebar 1400).
// Components use literal Tailwind classes (z-[1100] …) — no shared JS constant.

// ── Community appearance ──────────────────────────────────────────────────────
// Shared icon + colour palettes for creating and editing a community.

export const COMMUNITY_EMOJIS: string[] = [
  // Nature & wildlife
  '🐦', '🦋', '🌸', '🌿', '🍄', '🌊', '🌙', '⭐',
  '🦁', '🐬', '🦅', '🌺', '🦊', '🐸', '🌻', '🍀',
  // Places & landmarks
  '🏔️', '🏖️', '🗺️', '🏛️', '⛺', '🗼', '🏠', '🎪',
  // Food & drink
  '🌮', '🍕', '☕', '🍺', '🥗', '🍜', '🍦', '🦪',
  // Activities & culture
  '🎨', '🎵', '📚', '🚴', '🎮', '🧗', '🏊',
  // Transport & services
  '🚗', '✈️', '🚂', '🚻', '📶', '🏥', '⛽',
]

export const COMMUNITY_COLORS: string[] = [
  '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#14b8a6', '#3b82f6', '#06b6d4', '#84cc16', '#78716c',
]
