/** Bounding box stored as JSONB in communities.geo_restriction */
export interface GeoRestriction {
  name: string   // Human-readable place name, e.g. "New York City"
  south: number  // Min latitude
  north: number  // Max latitude
  west: number   // Min longitude
  east: number   // Max longitude
}

export interface Community {
  id: string
  name: string
  slug: string
  description: string | null
  color: string
  icon: string
  is_private: boolean               // true = invite-only; hidden from non-members
  created_by: string | null         // auth.users UUID of the creator
  require_approval: boolean         // pins need mod sign-off before going live
  default_pin_duration: PinDuration // auto-expiry applied to all new pins
  who_can_pin: WhoCanPin            // permission level required to drop a pin
  geo_restriction?: GeoRestriction | null // optional bounding-box area restriction
  created_at: string
}

export interface CommunityMember {
  id: string
  community_id: string
  user_id: string
  invited_by: string | null
  status: 'pending' | 'accepted'
  created_at: string
  profile: Pick<Profile, 'username' | 'avatar_url'> | null
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
  url: string | null                // optional external link (http/https)
  // Event / meetup fields — null means this is a regular pin, not an event
  event_date: string | null         // ISO timestamp of event start
  event_end_date: string | null     // ISO timestamp of event end (optional)
  event_capacity: number | null     // max attendees; null = unlimited
  created_at: string
  community?: Community
  profile?: Pick<Profile, 'username' | 'avatar_url'> | null
  /** Derived client-side from the pin_tags join — used for tag filtering */
  tag_ids?: string[]
}

export interface EventRsvp {
  id: string
  pin_id: string
  user_id: string
  created_at: string
}

/** A mod-defined tag label for a community */
export interface CommunityTag {
  id: string
  community_id: string
  name: string
  created_by: string | null
  created_at: string
}

/** A follow edge: follower_id follows followee_id */
export interface Follow {
  follower_id: string
  followee_id: string
  created_at: string
}

/** A user-defined named list of pins (spans communities) */
export interface Collection {
  id: string
  user_id: string
  name: string
  created_at: string
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

/** A user-defined folder for organising subscribed communities in the sidebar */
export interface CommunityGroup {
  id: string
  user_id: string
  name: string
  position: number
  created_at: string
}

/** Subset of community_members joined with community — used in the Sidebar invite banner */
export interface PendingInvite {
  id: string          // community_members.id
  community_id: string
  community: {
    name: string
    icon: string
    color: string
  } | null
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
