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
