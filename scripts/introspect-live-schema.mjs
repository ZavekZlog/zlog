/**
 * Live Supabase schema introspection via PostgREST OpenAPI (no DB password required).
 * Usage: node scripts/introspect-live-schema.mjs
 * Reads .env.local — never prints secrets.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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

function extractTable(def) {
  if (!def || typeof def !== 'object') return null
  const props = def.properties || {}
  const required = new Set(def.required || [])
  const columns = Object.entries(props).map(([name, schema]) => {
    const s = schema || {}
    return {
      name,
      type: s.type || s.format || (s.anyOf ? 'anyOf' : null),
      format: s.format || null,
      description: s.description || null,
      nullable:
        s.nullable === true ||
        (Array.isArray(s.type) && s.type.includes('null')) ||
        (Array.isArray(s.anyOf) && s.anyOf.some((x) => x?.type === 'null')) ||
        !required.has(name),
      requiredInSchema: required.has(name),
      default: s.default !== undefined ? s.default : null,
    }
  })
  return {
    required: [...required],
    columns,
    columnNames: columns.map((c) => c.name),
  }
}

async function main() {
  const env = loadEnvLocal()
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !anon) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
    process.exit(1)
  }

  const host = new URL(url).host
  console.log('Live host:', host)

  const headers = {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    Accept: 'application/openapi+json',
  }

  const openapiRes = await fetch(`${url}/rest/v1/`, { headers })
  const openapiText = await openapiRes.text()
  console.log('OpenAPI status:', openapiRes.status, openapiRes.statusText)

  let openapi
  try {
    openapi = JSON.parse(openapiText)
  } catch {
    console.error('OpenAPI body (first 500):', openapiText.slice(0, 500))
    process.exit(1)
  }

  const defs = openapi.definitions || openapi.components?.schemas || {}
  const tableNames = [
    'daily_reports',
    'report_labour',
    'report_plant',
    'report_photos',
    'projects',
  ]

  const tables = {}
  for (const name of tableNames) {
    // PostgREST often names defs as public_daily_reports or daily_reports
    const def =
      defs[name] ||
      defs[`public_${name}`] ||
      defs[`public.${name}`] ||
      null
    tables[name] = def ? extractTable(def) : { missing: true, searchedKeys: Object.keys(defs).filter((k) => k.includes(name)) }
  }

  // Anon probe (expect RLS empty)
  const probeHeaders = {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    Accept: 'application/json',
    Prefer: 'count=exact',
  }
  const probeRes = await fetch(`${url}/rest/v1/daily_reports?select=*&limit=1`, { headers: probeHeaders })
  const probeBody = await probeRes.text()
  const probe = {
    status: probeRes.status,
    statusText: probeRes.statusText,
    contentRange: probeRes.headers.get('content-range'),
    bodyPreview: probeBody.slice(0, 400),
  }

  const out = {
    introspectedAt: new Date().toISOString(),
    host,
    source: 'GET /rest/v1/ Accept: application/openapi+json',
    definitionKeysSample: Object.keys(defs).slice(0, 80),
    tables,
    anonProbeDailyReports: probe,
    note:
      'OpenAPI describes exposed PostgREST columns. RLS policies and DB NOT NULL constraints require SQL (service role / Dashboard).',
  }

  mkdirSync(resolve(root, 'docs'), { recursive: true })
  const outPath = resolve(root, 'docs/LIVE_SCHEMA_DAILY_REPORTS.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2))
  console.log('Wrote', outPath)

  const dr = tables.daily_reports
  if (dr?.columnNames) {
    console.log('\ndaily_reports columns (live OpenAPI):')
    for (const c of dr.columns) {
      console.log(`  - ${c.name}: type=${c.type} format=${c.format} requiredInSchema=${c.requiredInSchema} nullable=${c.nullable}`)
    }
    console.log('\nrequired array:', dr.required)
  } else {
    console.log('daily_reports missing from OpenAPI. Matching keys:', dr)
  }
  console.log('\nanon probe:', probe.status, probe.contentRange, probe.bodyPreview.slice(0, 120))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
