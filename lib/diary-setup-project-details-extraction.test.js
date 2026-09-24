/**
 * Unit 1 — Project Details extraction contracts (setup route behaviour unchanged).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assertSetupUiLabelOrder, SETUP_SECTION_SEQUENCE, SETUP_UI_LABEL_SEQUENCE } from './diary-setup-shift.js'
import {
  readSetupBehaviourSource,
  readSetupSectionSource,
  readSetupUiComposedSource,
  readSetupPageSource,
} from './diary-setup-ui-source.js'

describe('Site Diary Project Details extraction — Unit 1', () => {
  it('preserves SETUP_UI_LABEL_SEQUENCE in composed setup UI source', () => {
    const composed = readSetupUiComposedSource()
    const order = assertSetupUiLabelOrder(composed)
    assert.equal(order.ok, true, order.missing || order.outOfOrder || 'label order')
  })

  it('preserves setup section mount order in extracted section', () => {
    const section = readSetupSectionSource()
    assert.equal(assertSetupUiLabelOrder(section, SETUP_SECTION_SEQUENCE).ok, true)
    const projectSection = section.indexOf('title="Project Details"')
    const companySection = section.indexOf('aria-label="Reporting Company Name"')
    const behalfSection = section.indexOf('title="Reporting On Behalf Of"')
    const authorSection = section.indexOf('title="Author"')
    const coverSection = section.indexOf('title="Cover photo"')
    assert.ok(projectSection > 0 && companySection > projectSection)
    assert.ok(behalfSection > companySection)
    assert.ok(authorSection > behalfSection && coverSection > authorSection)
    assert.match(section, /<ProjectStickyFields/)
    assert.match(section, />LOGO</)
  })

  it('keeps Continue pipeline on controller', () => {
    const behaviour = readSetupBehaviourSource()
    assert.match(behaviour, /runDiarySetupContinue/)
    assert.match(behaviour, /persistReportingCompanyIdentity/)
    assert.match(behaviour, /const runContinuePersistence = async/)
    assert.match(behaviour, /const handleContinue = \(\) => runContinuePersistence/)
    assert.match(behaviour, /const persistProjectDetails = \(\) => runContinuePersistence/)
  })

  it('setup host still mounts extracted section', () => {
    const page = readSetupPageSource()
    assert.match(page, /SiteDiaryProjectDetailsSection/)
    assert.match(page, /useSiteDiaryProjectDetailsController/)
    assert.doesNotMatch(page, /title="Project Details"/)
  })

  it('SDSC fast path remains on controller', () => {
    const behaviour = readSetupBehaviourSource()
    assert.match(behaviour, /const trySdscFastPath = async/)
    assert.match(behaviour, /loadEditDiarySetupSources/)
  })

  it('label contract sequence unchanged', () => {
    assert.deepEqual(SETUP_UI_LABEL_SEQUENCE[0], 'Project Name')
    assert.deepEqual(SETUP_SECTION_SEQUENCE[0], 'Project Details')
  })
})
