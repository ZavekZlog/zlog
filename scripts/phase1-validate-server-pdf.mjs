/**
 * Structural validation of Phase 1 server PDF vs DB contract (no secrets).
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPORT_ID = '6846b690-b3f8-4a28-b0c1-a9a825a850f0'
const PDF_PATH = resolve(root, 'test-results/phase1-server-pdf-6sep-proof.pdf')

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
  return (latin.match(/\/Type\s*\/Page\b/g) || []).length
}

function countPdfImages(buffer) {
  const latin = buffer.toString('latin1')
  return (latin.match(/\/Subtype\s*\/Image\b/g) || []).length
}

function pdfContainsLatin1(buffer, needle) {
  return buffer.toString('latin1').includes(needle)
}

async function main() {
  const buf = readFileSync(PDF_PATH)
  const env = loadEnvLocal()
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: report } = await admin
    .from('daily_reports')
    .select(
      'site_summary, weather, shift, temporary_works_applicable, temporary_works, sign_in_sheet_url, equipment_hire',
    )
    .eq('id', REPORT_ID)
    .maybeSingle()

  const { data: photos } = await admin
    .from('report_photos')
    .select('sequence, caption, location')
    .eq('report_id', REPORT_ID)
    .order('sequence')

  const { data: labour } = await admin
    .from('report_labour')
    .select('trade, company, count, hours')
    .eq('report_id', REPORT_ID)
    .order('sequence')

  const { data: plant } = await admin
    .from('report_plant')
    .select('item, ref, status, notes')
    .eq('report_id', REPORT_ID)
    .order('sequence')

  const areas = []
  for (const p of photos || []) {
    const a = String(p.location || '').trim()
    if (a && !areas.includes(a)) areas.push(a)
  }

  const captionsFound = []
  const captionsMissing = []
  for (const p of photos || []) {
    const cap = String(p.caption || '').trim()
    if (!cap) continue
    if (pdfContainsLatin1(buf, cap.slice(0, 40))) captionsFound.push(cap.slice(0, 40))
    else captionsMissing.push(cap.slice(0, 40))
  }

  const checks = {
    opensAsPdf: buf.slice(0, 5).toString() === '%PDF-',
    pdfBytes: buf.length,
    pageCount: countPdfPages(buf),
    imageObjectCount: countPdfImages(buf),
    expectedPhotoCount: (photos || []).length,
    labourRowCount: (labour || []).length,
    plantRowCount: (plant || []).length,
    hasSignInSheetPath: Boolean(report?.sign_in_sheet_url),
    temporaryWorksApplicable: report?.temporary_works_applicable,
    temporaryWorksCount: Array.isArray(report?.temporary_works) ? report.temporary_works.length : 0,
    areaHeadingsChecked: areas.length,
    areaHeadingsFoundInPdf: areas.filter((a) => pdfContainsLatin1(buf, a)).length,
    captionsWithText: (photos || []).filter((p) => String(p.caption || '').trim()).length,
    captionsFoundInPdf: captionsFound.length,
    captionsMissingInPdf: captionsMissing.length,
    captionsMissingSample: captionsMissing.slice(0, 5),
    hasSiteSummarySnippet: report?.site_summary
      ? pdfContainsLatin1(buf, String(report.site_summary).trim().slice(0, 30))
      : null,
    hasLabourTradeSnippet:
      labour?.[0]?.trade ? pdfContainsLatin1(buf, String(labour[0].trade).slice(0, 20)) : null,
    hasZlogHeader: pdfContainsLatin1(buf, 'Zlog') || pdfContainsLatin1(buf, 'SITE DIARY'),
  }

  console.log(JSON.stringify(checks, null, 2))
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
