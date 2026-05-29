import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Discover Communities — MapCrowd',
  description: 'Browse all public MapCrowd communities and find places to explore, contribute, and connect.',
  openGraph: {
    title: 'Discover Communities — MapCrowd',
    description: 'Browse all public MapCrowd communities.',
  },
}

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
