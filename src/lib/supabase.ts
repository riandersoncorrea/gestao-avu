import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configurados. ' +
      'O app roda em modo demo (sem persistência real). Veja .env.example.',
  )
}

/**
 * Client singleton. Sem credenciais reais em .env, aponta para um projeto
 * placeholder — chamadas de rede falham silenciosamente, mas o app segue
 * funcional (auth/dados mockados nesta sprint).
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
)
