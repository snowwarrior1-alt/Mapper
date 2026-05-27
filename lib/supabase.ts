import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '\n\nMissing Supabase credentials.\n' +
    'Add the following to your .env.local file (or Vercel environment variables):\n' +
    '  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\n' +
    '  NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...\n\n' +
    'Find these in: Supabase Dashboard → Project Settings → API\n'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
