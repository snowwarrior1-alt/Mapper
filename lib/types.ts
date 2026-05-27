export interface Community {
  id: string
  name: string
  slug: string
  description: string | null
  color: string
  icon: string
  created_by: string | null         // auth.users UUID of the creator
  require_approval: boolean         // pins need mod sign-off before going live
  default_pin_duration: PinDuration // auto-expiry applied to all new pins
  who_can_pin: WhoCanPin            // permission level required to drop a pin
  created_at: string
}

/** How long new pins in a community live before auto-expiring */
export type PinDuration = 'permanent' | '1d' | '7d' | '30d' | '90d'

/** Who is allowed to drop pins in a community */
export type WhoCanPin = 'anyone' | 'subscribers' | 'mods'

export interface Profile {
  id: string
  username: string
  avatar_url: string | null
  created_at: string
}

export interface Pin {
  id: string
  community_id: string
  user_id: string | null
  title: string
  description: string | null
  lat: number
  lng: number
  vote_count: number
  status: 'pending' | 'approved' | 'rejected'
  expires_at: string | null         // ISO timestamp; null = permanent
  created_at: string
  community?: Community
  profile?: Pick<Profile, 'username' | 'avatar_url'> | null
}

export interface Vote {
  id: string
  pin_id: string
  session_id: string
  value: number
  created_at: string
}

export interface Comment {
  id: string
  pin_id: string
  user_id: string
  body: string
  created_at: string
  profile?: Pick<Profile, 'username' | 'avatar_url'> | null
}

export interface PinPhoto {
  id: string
  pin_id: string
  user_id: string
  url: string
  caption: string | null
  created_at: string
}

export interface CommunityModerator {
  community_id: string
  user_id: string
  profile: Pick<Profile, 'username' | 'avatar_url'> | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const PIN_DURATION_LABELS: Record<PinDuration, string> = {
  permanent: 'Permanent',
  '1d':  '24 hours',
  '7d':  '7 days',
  '30d': '30 days',
  '90d': '90 days',
}

export const WHO_CAN_PIN_LABELS: Record<WhoCanPin, string> = {
  anyone:      'Anyone',
  subscribers: 'Subscribers only',
  mods:        'Mods & owner only',
}
