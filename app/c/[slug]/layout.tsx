import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return { title: 'MapCrowd' }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data } = await supabase
    .from('communities')
    .select('name, description, icon')
    .eq('slug', slug)
    .single()

  if (!data) {
    return { title: 'Community not found — MapCrowd' }
  }

  const title = `${data.icon} ${data.name} — MapCrowd`
  const description =
    data.description ?? `Explore and contribute pins to the ${data.name} community on MapCrowd.`

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: 'summary', title, description },
  }
}

export default function CommunityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
