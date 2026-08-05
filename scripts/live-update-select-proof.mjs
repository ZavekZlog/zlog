/**
 * M0-A: Live UPDATE → SELECT proof against daily_reports.
 * Uses anon key only (same as OpenAPI). Does NOT invent columns.
 *
 * 1. SELECT one existing row
 * 2. UPDATE site_summary with a unique marker (payload keys ⊆ live OpenAPI columns)
 * 3. SELECT same id again
 * 4. Compare before / update response / fresh select
 * 5. Restore original site_summary
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

function summarize(result) {
  return {
    data: result.data ?? null,
    error: result.error
      ? {
          message: result.error.message,
          code: result.error.code,
          details: result.error.details,
          hint: result.error.hint,
        }
      : null,
    status: result.status ?? null,
    statusText: result.statusText ?? null,
    count: result.count ?? null,
  }
}

async function main() {
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const schema = JSON.parse(readFileSync(resolve(root, 'docs/LIVE_SCHEMA_DAILY_REPORTS.json'), 'utf8'))
  const liveColumns = new Set(schema.tables.daily_reports.columnNames)
  const required = schema.tables.daily_reports.required

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const beforeList = await supabase
    .from('daily_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)

  const beforeSummary = summarize(beforeList)
  console.log('BEFORE list status:', beforeSummary.status, beforeSummary.error)

  const row = beforeList.data?.[0]
  if (!row) {
    const out = {
      ok: false,
      reason: 'No readable daily_reports row with anon key',
      before: beforeSummary,
      liveColumns: [...liveColumns],
      required,
    }
    writeFileSync(resolve(root, 'docs/LIVE_UPDATE_SELECT_PROOF.json'), JSON.stringify(out, null, 2))
    console.error(JSON.stringify(out, null, 2))
    process.exit(1)
  }

  const reportId = row.id
  const originalSummary = row.site_summary
  const marker = `M0-A-PROBE ${new Date().toISOString()}`

  // Payload ONLY from live schema keys (never insert; never guess columns).
  const payload = {
    site_summary: marker,
  }
  for (const key of Object.keys(payload)) {
    if (!liveColumns.has(key)) {
      throw new Error(`Refusing to write non-live column: ${key}`)
    }
  }

  console.log('Target id:', reportId)
  console.log('owner_id:', row.owner_id)
  console.log('project_id:', row.project_id)
  console.log('Original site_summary:', originalSummary)
  console.log('UPDATE filter: eq(id, reportId) only')
  console.log('UPDATE payload keys:', Object.keys(payload))

  const updateRes = await supabase
    .from('daily_reports')
    .update(payload)
    .eq('id', reportId)
    .select()
    .single()

  const updateSummary = summarize(updateRes)
  console.log('UPDATE response:', JSON.stringify(updateSummary, null, 2))

  const afterRes = await supabase
    .from('daily_reports')
    .select('*')
    .eq('id', reportId)
    .single()

  const afterSummary = summarize(afterRes)
  console.log('FRESH SELECT site_summary:', afterRes.data?.site_summary)
  console.log('SELECT matches marker?', afterRes.data?.site_summary === marker)

  // Restore original value so we don't leave probe text (best-effort).
  const restoreRes = await supabase
    .from('daily_reports')
    .update({ site_summary: originalSummary })
    .eq('id', reportId)
    .select('id, site_summary')
    .single()

  const proof = {
    ok: afterRes.data?.site_summary === marker && !updateRes.error && updateRes.data?.id === reportId,
    primaryKey: 'id',
    updateFilter: { id: reportId },
    ownerUserRelationship: {
      column: 'owner_id',
      valueOnRow: row.owner_id,
      requiredOnInsert: required.includes('owner_id'),
      note: 'Live OpenAPI marks owner_id required. Repo migrations RLS used projects.owner_id; live table has its own owner_id.',
    },
    liveColumns: [...liveColumns],
    requiredColumns: required,
    before: {
      id: row.id,
      owner_id: row.owner_id,
      project_id: row.project_id,
      site_summary: originalSummary,
      columnNamesPresent: Object.keys(row),
    },
    update: {
      payload,
      response: updateSummary,
    },
    freshSelect: {
      response: afterSummary,
      site_summary: afterRes.data?.site_summary ?? null,
      matchedMarker: afterRes.data?.site_summary === marker,
    },
    restore: summarize(restoreRes),
  }

  writeFileSync(resolve(root, 'docs/LIVE_UPDATE_SELECT_PROOF.json'), JSON.stringify(proof, null, 2))
  console.log('\nPROOF ok =', proof.ok)
  console.log('Wrote docs/LIVE_UPDATE_SELECT_PROOF.json')
  if (!proof.ok) process.exit(2)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
