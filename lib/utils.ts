// ── Time helpers ──────────────────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export function timeUntil(iso: string): string {
  const secs = Math.floor((new Date(iso).getTime() - Date.now()) / 1000)
  if (secs <= 0) return 'expired'
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}

/** Format an event's start (and optional end) datetime for display.
 *  e.g. "Sat, Jun 14 · 7:00 PM – 10:00 PM"  or  "Sat, Jun 14 · 7:00 PM" */
export function formatEventDate(start: string, end?: string | null): string {
  const s = new Date(start)
  const datePart  = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const startTime = s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (end) {
    const endTime = new Date(end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    return `${datePart} · ${startTime} – ${endTime}`
  }
  return `${datePart} · ${startTime}`
}

// ── Permissions ───────────────────────────────────────────────────────────────

import type { Community } from './types'

/** Client-side mirror of the who_can_pin RLS check (the DB is the source of truth). */
export function canUserPinInCommunity(
  community: Community,
  userId: string | null,
  subscribedIds: Set<string>,
  moderatedIds: Set<string>,
): boolean {
  if (community.who_can_pin === 'anyone') return true
  if (!userId) return false // anonymous users can only pin in 'anyone' communities
  if (community.who_can_pin === 'subscribers') return subscribedIds.has(community.id)
  if (community.who_can_pin === 'mods') return moderatedIds.has(community.id)
  return true
}

// ── Number formatting ─────────────────────────────────────────────────────────

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// ── Avatar color ──────────────────────────────────────────────────────────────

export const AVATAR_COLORS = [
  '#6366f1', '#a855f7', '#ec4899', '#f97316',
  '#22c55e', '#14b8a6', '#3b82f6', '#eab308',
] as const

export function avatarColor(uid: string): string {
  return AVATAR_COLORS[parseInt(uid[0], 16) % AVATAR_COLORS.length]
}
