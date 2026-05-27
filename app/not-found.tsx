import Link from 'next/link'
import { MapPin } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-950 text-white">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 border border-gray-800">
        <MapPin className="h-8 w-8 text-gray-600" />
      </div>
      <div className="text-center">
        <p className="text-5xl font-bold text-gray-700 mb-3">404</p>
        <h1 className="text-xl font-semibold text-white">Page not found</h1>
        <p className="mt-2 text-sm text-gray-500">
          This spot doesn&apos;t exist on the map yet.
        </p>
      </div>
      <Link
        href="/"
        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
      >
        <MapPin className="h-4 w-4" />
        Back to the map
      </Link>
    </div>
  )
}
