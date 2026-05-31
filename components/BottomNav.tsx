'use client'

import Link from 'next/link'
import { Map as MapIcon, Compass, Newspaper, User2 } from 'lucide-react'

interface BottomNavProps {
  /** Username of the signed-in user, or null when signed out */
  username: string | null
  /** Tap "Map" — close any open panel/overlay and return to the bare map */
  onMap: () => void
  /** Tap "Feed" — open the sidebar on the activity-feed tab */
  onFeed: () => void
  /** Tap "Profile" while signed out — open the auth modal */
  onSignIn: () => void
}

function Item({
  icon, label, active, onClick, href,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick?: () => void
  href?: string
}) {
  const cls = `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
    active ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'
  }`
  const inner = (
    <>
      {icon}
      <span>{label}</span>
    </>
  )
  return href ? (
    <Link href={href} className={cls}>{inner}</Link>
  ) : (
    <button onClick={onClick} className={cls}>{inner}</button>
  )
}

/** Mobile-only persistent bottom navigation. Hidden on md+ (desktop uses the sidebar). */
export default function BottomNav({ username, onMap, onFeed, onSignIn }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[1100] flex h-14 items-stretch border-t border-gray-800 bg-gray-900/95 backdrop-blur-sm md:hidden">
      <Item icon={<MapIcon className="h-5 w-5" />} label="Map" active onClick={onMap} />
      <Item icon={<Compass className="h-5 w-5" />} label="Discover" href="/discover" />
      <Item icon={<Newspaper className="h-5 w-5" />} label="Feed" onClick={onFeed} />
      {username ? (
        <Item icon={<User2 className="h-5 w-5" />} label="Profile" href={`/u/${username}`} />
      ) : (
        <Item icon={<User2 className="h-5 w-5" />} label="Sign in" onClick={onSignIn} />
      )}
    </nav>
  )
}
