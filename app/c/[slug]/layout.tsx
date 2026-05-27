import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'

// Server-only Supabase client (env vars are available server-side without NEXT_PUBLIC_ too,
// but we reuse the public vars here since this is metadata-only, not sensitive)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params

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
