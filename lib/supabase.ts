import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export const supabase = createClient()

export async function upsertUserPreferences(userId: string, prefs: {
  theme?: string
  timezone?: string
  language?: string
  widget_game_id?: string
  favorite_teams?: string[]
  favorite_leagues?: string[]
  default_sport?: string
}) {
  return supabase.from('user_preferences').upsert({
    user_id: userId,
    ...prefs,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' })
}

export async function loadUserPreferences(userId: string) {
  return supabase.from('user_preferences').select('*').eq('user_id', userId).single()
}
