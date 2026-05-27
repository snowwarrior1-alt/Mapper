'use client'

import { avatarColor } from '@/lib/utils'

interface AvatarProps {
  src?: string | null
  username: string
  userId: string
  /**
   * Tailwind classes for size, shape, and any ring/shadow applied to both
   * the <img> and the fallback <div>. Include text-size for the initials.
   *
   * @example "h-8 w-8 rounded-full text-xs"
   * @example "h-7 w-7 rounded-full text-[10px]"
   * @example "h-20 w-20 rounded-2xl text-3xl"
   */
  className?: string
  /** Number of username characters to show as initials (default: 2) */
  chars?: 1 | 2
}

export default function Avatar({
  src,
  username,
  userId,
  className = 'h-8 w-8 rounded-full text-xs',
  chars = 2,
}: AvatarProps) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={username}
      className={`shrink-0 object-cover ${className}`}
    />
  ) : (
    <div
      className={`shrink-0 flex items-center justify-center font-bold text-white ${className}`}
      style={{ backgroundColor: avatarColor(userId) }}
    >
      {username.slice(0, chars).toUpperCase()}
    </div>
  )
}
