import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client for the standalone worker (no user JWT).
 * @param {{ supabaseUrl: string, serviceRoleKey: string }} config
 */
export function createWorkerSupabaseAdmin(config) {
  const url = String(config?.supabaseUrl || '').trim()
  const key = String(config?.serviceRoleKey || '').trim()
  if (!url || !key) {
    throw new Error('Worker Supabase admin requires supabaseUrl and serviceRoleKey.')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
