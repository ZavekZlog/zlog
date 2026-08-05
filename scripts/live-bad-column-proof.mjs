/**
 * Prove that writing a non-live column aborts the entire UPDATE.
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
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: row } = await supabase
    .from('daily_reports')
    .select('id, site_summary')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const bad = await supabase
    .from('daily_reports')
    .update({ site_summary: 'SHOULD_NOT_PERSIST_IF_IS_DRAFT_REJECTED', is_draft: false })
    .eq('id', row.id)
    .select()
    .single()

  const after = await supabase
    .from('daily_reports')
    .select('id, site_summary')
    .eq('id', row.id)
    .single()

  const out = {
    reportId: row.id,
    badUpdate: {
      error: bad.error
        ? { message: bad.error.message, code: bad.error.code, details: bad.error.details, hint: bad.error.hint }
        : null,
      status: bad.status,
      dataId: bad.data?.id ?? null,
      dataSiteSummary: bad.data?.site_summary ?? null,
    },
    freshSelectSiteSummary: after.data?.site_summary ?? null,
    conclusion:
      bad.error && /is_draft|schema cache|column/i.test(bad.error.message || '')
        ? 'CONFIRMED: including is_draft (absent from live schema) fails the UPDATE; edited value does not persist.'
        : 'Unexpected — inspect response',
  }

  writeFileSync(resolve(root, 'docs/LIVE_BAD_COLUMN_PROOF.json'), JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
