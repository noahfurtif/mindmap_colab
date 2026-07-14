import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Variables d\'environnement manquantes. Copiez .env.example en .env.local et remplissez vos clés.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
