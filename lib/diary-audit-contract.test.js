/**
 * 2026-09-06 Site Diary audit — approved specification locked in contracts.
 * Phase 0: does not require live UI/PDF to already match.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const screen = readFileSync(join(root, 'docs/contracts/SITE_DIARY_SCREEN_CONTRACT.md'), 'utf8')
const protectedDiary = readFileSync(join(root, 'docs/PROTECTED_SITE_DIARY_CONTRACT.md'), 'utf8')
const projectModel = readFileSync(join(root, 'docs/contracts/PROJECT_MODEL_CONTRACT.md'), 'utf8')
const branding = readFileSync(join(root, 'docs/contracts/REPORT_BRANDING_CONTRACT.md'), 'utf8')
const photo = readFileSync(join(root, 'docs/contracts/PHOTO_WORKSPACE_CONTRACT.md'), 'utf8')
const pdfCheckpoint = readFileSync(
  join(root, 'docs/contracts/SITE_DIARY_PDF_CHECKPOINT_CONTRACT.md'),
  'utf8',
)
const product = readFileSync(join(root, 'docs/PROTECTED_PRODUCT_DECISIONS.md'), 'utf8')
const copy = JSON.parse(
  readFileSync(join(root, 'docs/contracts/APPROVED_UI_COPY.json'), 'utf8'),
)

describe('Site Diary audit Phase 0 — approved specification in contracts', () => {
  it('records the locked setup hierarchy in order', () => {
    const name = screen.indexOf('**Project Name**')
    const reference = screen.indexOf('**Project Reference**')
    const address = screen.indexOf('**Project Address**')
    const principal = screen.indexOf('**Principal Contractor**')
    const cover = screen.indexOf('**Cover Photo**')
    const commencement = screen.indexOf('**Project Commencement Date**')
    const completion = screen.indexOf('**Project Completion Date**')
    const pm = screen.indexOf('**Project Manager**')
    const siteManager = screen.indexOf('**Site Manager**')
    const reportingOrg = screen.indexOf('**Reporting Organisation**')
    const behalf = screen.indexOf('**Reporting on behalf of**')
    const author = screen.indexOf('**Author of Diary**')
    const role = screen.indexOf('**Author Role**')
    const workingDays = screen.indexOf('**Working Days per Week**')
    const shift = screen.indexOf('**Shift Pattern**')
    assert.ok(name > 0 && reference > name, 'Project Reference immediately beneath Project Name')
    assert.ok(address > reference)
    assert.ok(principal > address && cover > principal)
    assert.ok(commencement > cover && completion > commencement)
    assert.ok(pm > completion && siteManager > pm)
    assert.ok(reportingOrg > siteManager && behalf > reportingOrg)
    assert.ok(author > behalf && role > author)
    assert.ok(workingDays > role && shift > workingDays)
    assert.match(screen, /Site Diary — \[Report Date\]/)
  })

  it('locks superseded setup CTAs and labels', () => {
    assert.match(screen, /Continue to Today's Report/)
    assert.doesNotMatch(screen, /New-diary primary CTA: \*\*Continue to Site Diary\*\*/)
    assert.match(screen, /Project Commencement Date/)
    assert.match(screen, /Project Completion Date/)
    assert.match(screen, /Project Day No\./)
    assert.match(screen, /Project Week No\./)
    const labels = copy.terms.map((term) => term.label)
    assert.ok(labels.includes("Continue to Today's Report"))
    assert.equal(labels.includes('Continue to Site Diary'), false)
    assert.equal(labels.includes("Continue to Today's Diary"), false)
  })

  it('locks cover management, compact IA, and the red-management rule', () => {
    assert.match(screen, /Change or remove cover photo/)
    assert.match(screen, /Change photo/)
    assert.match(screen, /Remove photo/)
    assert.match(screen, /Red is used only for the confirmed destructive/)
    assert.match(screen, /52–60px minimum row height/)
    assert.match(screen, /Routine \*\*Edit\*\* \/ \*\*Remove\*\* \/ \*\*Change\*\*/)
    assert.match(protectedDiary, /Routine Edit \/ Remove \/ Change controls are neutral/)
  })

  it('locks weather, site summary, and saved-item UX', () => {
    assert.match(screen, /numeric \*\*Temperature\*\* field/)
    assert.match(screen, /Sunny, hot, humid, 33°C/)
    assert.match(screen, /large enough while editing; compact once saved/)
    assert.match(screen, /A new item opens only when deliberately requested/)
    assert.match(screen, /\+ Add another H&S incident \/ observation/)
  })

  it('records project-level refs, transactional allocation, and Deliveries-before-links', () => {
    for (const ref of ['H&S-001', 'RFI-001', 'VAR-001', 'Delay-001', 'LP-001', 'DEL-001']) {
      assert.match(screen, new RegExp(ref.replace('-', '\\-')))
    }
    assert.match(screen, /transactional on the database/)
    assert.match(screen, /Client-side read\/increment\/write numbering is forbidden/)
    assert.match(screen, /must exist before/)
    assert.match(screen, /DEL-018 ↔ LP-004 ↔ H&S-012 ↔ Delay-006/)
    assert.match(product, /database-transaction allocated/)
  })

  it('records linked-record intent, Action Required, labour filter, and PDF completeness', () => {
    assert.match(screen, /Do not duplicate image files into an H&S silo/)
    assert.match(screen, /H&S-007 ↔ Delay-003/)
    assert.match(screen, /must not make a definitive legal RIDDOR decision/)
    assert.match(screen, /review\/edit the suggested summary/)
    assert.match(screen, /Do \*\*not\*\* import all dates/)
    assert.match(screen, /Complete populated workbench data must flow into the PDF/)
    assert.match(screen, /Banner spans the full usable content width/)
    assert.match(photo, /PHOTO-001/)
    assert.match(photo, /Do not duplicate image files into an H&S-specific silo/)
  })

  it('keeps reporting-company colour authoritative', () => {
    assert.match(branding, /company colour remains \*\*authoritative\*\*/)
    assert.match(branding, /diary module violet/)
    assert.match(branding, /Zlog orange/)
    assert.match(screen, /Reporting-company `brand_color` remains authoritative/)
    assert.match(projectModel, /Project Commencement Date/)
    assert.match(pdfCheckpoint, /2026-09-06 supersession/)
    assert.match(pdfCheckpoint, /SITE_DIARY_SCREEN_CONTRACT\.md` §4L/)
  })
})
