import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(root, 'scripts/check-approved-copy.mjs')

describe('approved UI copy gate', () => {
  it('PASS against current sources', () => {
    const r = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr || r.stdout)
    assert.match(r.stdout, /PASS/)
    assert.match(r.stdout, /NOT visual/)
  })

  it('manifest lists Sign out and the approved Site Diary pre-flight copy', () => {
    const copy = JSON.parse(
      readFileSync(join(root, 'docs/contracts/APPROVED_UI_COPY.json'), 'utf8'),
    )
    const labels = copy.terms.map((t) => t.label)
    assert.ok(labels.includes('Sign out'))
    assert.ok(labels.includes('Project & Report Details'))
    assert.ok(labels.includes("Continue to Today's Report"))
    assert.equal(labels.includes('Continue to Site Diary'), false)
    assert.equal(labels.includes("Continue to Today's Diary"), false)
    assert.ok(labels.includes('Project Commencement Date'))
    assert.ok(labels.includes('Change or remove cover photo'))
    assert.equal(labels.includes('Save and Continue'), false)
    assert.equal(labels.includes('Edit Report Details'), false)
    assert.ok(labels.includes('Site Diary'))
  })
})
