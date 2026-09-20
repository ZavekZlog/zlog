/**
 * One-shot Phase 1 live server PDF proof (dev only).
 * Never logs secrets. Writes PDF to test-results/.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPORT_ID = '6846b690-b3f8-4a28-b0c1-a9a825a850f0'
const API_URL = `http://localhost:3000/api/site-diary/${REPORT_ID}/pdf?mode=sync-dev-only`

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

function countPdfPages(buffer) {
  const latin = buffer.toString('latin1')
  const kids = latin.match(/\/Type\s*\/Page\b/g)
  return kids ? kids.length : null
}

async function main() {
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anon || !service) {
    console.log(JSON.stringify({ ok: false, code: 'missing-env' }))
    process.exit(1)
  }

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: row, error: rowErr } = await admin
    .from('daily_reports')
    .select('id, project_id, projects ( owner_id )')
    .eq('id', REPORT_ID)
    .maybeSingle()

  if (rowErr || !row?.projects?.owner_id) {
    console.log(JSON.stringify({ ok: false, code: 'report-load', error: rowErr?.message || 'no-row' }))
    process.exit(1)
  }

  const ownerId = row.projects.owner_id
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(ownerId)
  const email = userData?.user?.email
  if (userErr || !email) {
    console.log(JSON.stringify({ ok: false, code: 'owner-email', error: userErr?.message || 'no-email' }))
    process.exit(1)
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHash = linkData?.properties?.hashed_token
  if (linkErr || !tokenHash) {
    console.log(JSON.stringify({ ok: false, code: 'magiclink', error: linkErr?.message || 'no-token' }))
    process.exit(1)
  }

  const cookieJar = []
  const sessionClient = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieJar
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) {
          const idx = cookieJar.findIndex((x) => x.name === c.name)
          const entry = { name: c.name, value: c.value }
          if (idx >= 0) cookieJar[idx] = entry
          else cookieJar.push(entry)
        }
      },
    },
  })

  const { error: otpErr } = await sessionClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  })
  if (otpErr) {
    console.log(JSON.stringify({ ok: false, code: 'verify-otp', error: otpErr.message }))
    process.exit(1)
  }

  const cookieHeader = cookieJar.map((c) => `${c.name}=${c.value}`).join('; ')

  const { data: photos } = await admin
    .from('report_photos')
    .select('sequence, caption, location')
    .eq('report_id', REPORT_ID)
    .order('sequence')
  const expectedPhotoCount = Array.isArray(photos) ? photos.length : 0

  const { request } = await import('node:http')
  const outDir = resolve(root, 'test-results')
  mkdirSync(outDir, { recursive: true })
  const pdfPath = resolve(outDir, 'phase1b-server-pdf-6sep-proof.pdf')

  const { statusCode, headers, bodyBuf } = await new Promise((resolvePromise, rejectPromise) => {
    const req = request(
      API_URL,
      {
        method: 'POST',
        headers: { Cookie: cookieHeader },
        timeout: 600_000,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          resolvePromise({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            bodyBuf: Buffer.concat(chunks),
          })
        })
      },
    )
    req.on('error', rejectPromise)
    req.on('timeout', () => {
      req.destroy(new Error('request-timeout'))
    })
    req.end()
  })

  const timingHeader = headers['x-zlog-server-pdf-timing']
  let timing = null
  try {
    timing = timingHeader ? JSON.parse(String(timingHeader)) : null
  } catch {
    timing = { raw: timingHeader }
  }

  if (statusCode < 200 || statusCode >= 300) {
    console.log(
      JSON.stringify({
        ok: false,
        httpStatus: statusCode,
        timing,
        errBodyPreview: bodyBuf.toString('utf8').slice(0, 500),
        expectedPhotoCount,
      }),
    )
    process.exit(1)
  }

  const buf = bodyBuf
  writeFileSync(pdfPath, buf)

  const pageCount = countPdfPages(buf)
  console.log(
    JSON.stringify({
      ok: true,
      httpStatus: statusCode,
      timing,
      pdfBytes: buf.length,
      pageCount,
      pdfPath,
      expectedPhotoCount,
      opensAsPdf: buf.slice(0, 5).toString() === '%PDF-',
    }),
  )
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, code: 'unhandled', error: err?.message || String(err) }))
  process.exit(1)
})
