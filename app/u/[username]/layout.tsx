import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const { username } = await params

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return { title: 'MapCrowd' }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', username)
    .single()

  if (!data) {
    return { title: 'User not found — MapCrowd' }
  }

  const title = `${data.username} — MapCrowd`
  const description = `View ${data.username}'s pins and contributions on MapCrowd.`

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: 'summary', title, description },
  }
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
