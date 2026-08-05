/**
 * Attempt to read live RLS policy definitions.
 * Without service role / DB URL this will fail — report that fact explicitly.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvLocal() {
  const raw = readFileSync(resolve(root, '.env.local'), 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    env[m[1]] = v
  }
  return env
}

async function main() {
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || null
  const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL || null

  const attempts = []

  // 1) Hypothetical RPC (usually absent)
  {
    const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const res = await supabase.rpc('pg_policies_for_table', { table_name: 'daily_reports' })
    attempts.push({
      method: 'rpc pg_policies_for_table (anon)',
      error: res.error ? { message: res.error.message, code: res.error.code } : null,
      data: res.data ?? null,
    })
  }

  // 2) Try reading pg_catalog via PostgREST (almost never exposed)
  {
    const res = await fetch(`${url}/rest/v1/pg_policies?select=*&tablename=eq.daily_reports`, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        Accept: 'application/json',
      },
    })
    const text = await res.text()
    attempts.push({
      method: 'GET /rest/v1/pg_policies (anon)',
      status: res.status,
      bodyPreview: text.slice(0, 300),
    })
  }

  // 3) Empirical RLS behaviour with anon
  {
    const supabase = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const sel = await supabase.from('daily_reports').select('id').limit(3)
    const sampleId = sel.data?.[0]?.id
    let upd = null
    if (sampleId) {
      upd = await supabase
        .from('daily_reports')
        .update({ weather: 'M0-RLS-PROBE-NOOP' })
        .eq('id', sampleId)
        .select('id, weather')
        .maybeSingle()
      // restore is best-effort skipped for weather probe — set back null if we changed
      if (upd.data?.id) {
        await supabase.from('daily_reports').update({ weather: null }).eq('id', sampleId)
      }
    }
    attempts.push({
      method: 'empirical anon SELECT/UPDATE',
      selectCount: sel.data?.length ?? 0,
      selectError: sel.error?.message ?? null,
      updateError: upd?.error?.message ?? null,
      updateReturnedRow: !!upd?.data?.id,
      updateStatus: upd?.status ?? null,
    })
  }

  const out = {
    introspectedAt: new Date().toISOString(),
    hasServiceRoleKey: !!service,
    hasDatabaseUrl: !!databaseUrl,
    policySqlAvailable: false,
    reason:
      'Exact RLS policy definitions require Postgres (pg_policies) or Supabase Dashboard SQL. This environment only has NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    attempts,
  }

  writeFileSync(resolve(root, 'docs/LIVE_RLS_PROBE.json'), JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
