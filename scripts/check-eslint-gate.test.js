import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifyDormantEslintErrors,
  diffWarningBaselines,
  fingerprintFromBaselineRecord,
  fingerprintFromEslintMessage,
  isPhoto001NoImgSurface,
} from './lib/eslint-gate.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const exceptionsScript = join(root, 'scripts/check-eslint-exceptions.mjs')
const gateScript = join(root, 'scripts/run-eslint-gate.mjs')
const fixtures = join(root, 'scripts/fixtures/eslint-gate')

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
  })
}

function writeTempJson(payload) {
  const dir = mkdtempSync(join(tmpdir(), 'zlog-eslint-gate-'))
  const path = join(dir, 'eslint.json')
  writeFileSync(path, `${JSON.stringify(payload)}\n`)
  return path
}

function unusedMessage(name) {
  return {
    severity: 1,
    ruleId: '@typescript-eslint/no-unused-vars',
    message: `'${name}' is assigned a value but never used.`,
    line: name === 'extraNew' ? 2 : 1,
  }
}

describe('ESLint exception registry', () => {
  it('FAIL when a protected rule is disabled without a registered exception ID', () => {
    const r = run(exceptionsScript, [
      '--exceptions',
      'scripts/fixtures/eslint-gate/exceptions-empty.json',
      '--scan-files',
      'scripts/fixtures/eslint-gate/unregistered.jsx',
    ])
    assert.equal(r.status, 1, r.stderr || r.stdout)
    assert.match(r.stderr, /unregistered-disable/)
  })

  it('PASS when a registered narrow exception matches the disable comment', () => {
    const r = run(exceptionsScript, [
      '--exceptions',
      'scripts/fixtures/eslint-gate/exceptions-ok.json',
      '--scan-files',
      'scripts/fixtures/eslint-gate/registered.jsx',
    ])
    assert.equal(r.status, 0, r.stderr || r.stdout)
    assert.match(r.stdout, /PASS/)
  })
})

describe('ESLint warning baseline', () => {
  it('FAIL when a new warning is not in the approved baseline', () => {
    const sample = join(fixtures, 'sample-source.js')
    const json = writeTempJson([
      {
        filePath: sample,
        messages: [unusedMessage('approvedUnused'), unusedMessage('extraNew')],
      },
    ])
    const r = run(gateScript, [
      '--skip-exceptions',
      '--eslint-json',
      json,
      '--warnings-baseline',
      'scripts/fixtures/eslint-gate/warnings-baseline.json',
    ])
    assert.equal(r.status, 1, r.stderr || r.stdout)
    assert.match(r.stdout, /New warnings: 1/)
    assert.match(r.stderr, /New ESLint warnings/)
  })

  it('PASS when the warning fingerprint is already in the approved baseline', () => {
    const sample = join(fixtures, 'sample-source.js')
    const json = writeTempJson([
      {
        filePath: sample,
        messages: [unusedMessage('approvedUnused')],
      },
    ])
    const r = run(gateScript, [
      '--skip-exceptions',
      '--eslint-json',
      json,
      '--warnings-baseline',
      'scripts/fixtures/eslint-gate/warnings-baseline.json',
    ])
    assert.equal(r.status, 0, r.stderr || r.stdout)
    assert.match(r.stdout, /ESLint errors: 0/)
    assert.match(r.stdout, /Approved baseline warnings: 1/)
    assert.match(r.stdout, /New warnings: 0/)
  })

  it('PASS when an approved warning is removed without keeping a dead baseline entry', () => {
    const sample = join(fixtures, 'sample-source.js')
    const json = writeTempJson([
      {
        filePath: sample,
        messages: [],
      },
    ])
    const r = run(gateScript, [
      '--skip-exceptions',
      '--eslint-json',
      json,
      '--warnings-baseline',
      'scripts/fixtures/eslint-gate/warnings-baseline.json',
    ])
    assert.equal(r.status, 0, r.stderr || r.stdout)
    assert.match(r.stdout, /New warnings: 0/)
    assert.match(r.stdout, /Removed \(stale baseline entries, allowed\): 1/)
  })

  it('FAIL when a new no-img-element warning appears on a PHOTO-001 surface', () => {
    const photoSurface = join(root, 'components/photo-workspace/CapturePhotoPreview.jsx')
    const json = writeTempJson([
      {
        filePath: photoSurface,
        messages: [
          {
            severity: 1,
            ruleId: '@next/next/no-img-element',
            message: 'Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image`.',
            line: 1,
          },
        ],
      },
    ])
    const r = run(gateScript, [
      '--skip-exceptions',
      '--eslint-json',
      json,
      '--warnings-baseline',
      'scripts/fixtures/eslint-gate/warnings-baseline.json',
    ])
    assert.equal(r.status, 1, r.stderr || r.stdout)
    assert.match(r.stdout, /New warnings: 1/)
    assert.match(r.stderr, /PHOTO-001: do not convert user photos to next\/image/)
    assert.equal(isPhoto001NoImgSurface('components/photo-workspace/CapturePhotoPreview.jsx'), true)
  })

  it('does not let a duplicate fingerprint hide an extra occurrence', () => {
    const fp = 'lib/premium-ui.jsx::@typescript-eslint/no-unused-vars::_meta::meta: _meta,'
    const diff = diffWarningBaselines([fp, fp, fp], [fp, fp])
    assert.equal(diff.approved.length, 2)
    assert.equal(diff.newWarnings.length, 1)
  })

  it('round-trips baseline records to the same fingerprint as live ESLint output', () => {
    const sample = join(fixtures, 'sample-source.js')
    const text = readFileSync(sample, 'utf8')
    const live = fingerprintFromEslintMessage(
      'scripts/fixtures/eslint-gate/sample-source.js',
      unusedMessage('approvedUnused'),
      text,
    )
    const fromBaseline = fingerprintFromBaselineRecord({
      file: 'scripts/fixtures/eslint-gate/sample-source.js',
      rule: '@typescript-eslint/no-unused-vars',
      messageKey: 'approvedUnused',
      sourceHint: 'const approvedUnused = 1',
    })
    assert.equal(live, fromBaseline)
  })
})

describe('exact diagnostic-script ignore', () => {
  it('does not ignore other scripts via a scripts/** blanket', () => {
    const config = readFileSync(join(root, 'eslint.config.mjs'), 'utf8')
    assert.match(config, /scripts\/introspect-live-daily-reports-schema\.mjs/)
    assert.doesNotMatch(config, /['"]scripts\/\*\*['"]/)
    assert.match(config, /scripts\/fixtures\/\*\*/)
    const r = spawnSync('npx', ['eslint', 'scripts/check-change-scope.test.js', '-f', 'json'], {
      cwd: root,
      encoding: 'utf8',
      shell: true,
      maxBuffer: 4 * 1024 * 1024,
    })
    const start = (r.stdout || '').indexOf('[')
    assert.notEqual(start, -1, r.stderr || r.stdout)
    const results = JSON.parse(r.stdout.slice(start))
    const warnings = (results[0]?.messages || []).filter((m) => m.severity === 1)
    assert.ok(
      warnings.length > 0,
      'scripts/check-change-scope.test.js must still be linted (introspect ignore is exact-file only)',
    )
  })
})

function e8Error(file = 'components/ai-annotation/AreaPhotoViewer.jsx') {
  return {
    file,
    line: 225,
    rule: 'react-hooks/preserve-manual-memoization',
    message: 'Calling a prop inside a state updater is not supported',
  }
}

describe('DORMANT-001 dormant ESLint defects', () => {
  it('does not treat E8 as an approved ESLINT-* exception', () => {
    const registry = JSON.parse(
      readFileSync(join(root, 'docs/contracts/APPROVED_ESLINT_EXCEPTIONS.json'), 'utf8'),
    )
    const ids = (registry.exceptions || []).map((e) => e.id)
    assert.equal(ids.includes('ESLINT-E8'), false)
    assert.doesNotMatch(
      readFileSync(join(root, 'components/ai-annotation/AreaPhotoViewer.jsx'), 'utf8'),
      /preserve-manual-memoization/,
    )
  })

  it('keeps DORMANT-001 as the activation lock', () => {
    const behaviours = JSON.parse(
      readFileSync(join(root, 'docs/contracts/APPROVED_BEHAVIOUR_REGISTRY.json'), 'utf8'),
    )
    assert.ok((behaviours.behaviours || []).some((b) => b.id === 'DORMANT-001'))
    const gate = readFileSync(join(root, 'scripts/run-release-gate.mjs'), 'utf8')
    assert.match(gate, /lib\/ai-annotation\/area-photo-viewer-dormant\.test\.js/)
  })

  it('does not block today when DORMANT-001 is active and E8 is in AreaPhotoViewer only', () => {
    const json = writeTempJson([
      {
        filePath: join(root, 'components/ai-annotation/AreaPhotoViewer.jsx'),
        messages: [
          {
            severity: 2,
            ruleId: 'react-hooks/preserve-manual-memoization',
            message: 'Calling a prop inside a state updater is not supported',
            line: 225,
          },
        ],
      },
    ])
    const r = run(gateScript, [
      '--skip-exceptions',
      '--eslint-json',
      json,
      '--warnings-baseline',
      'scripts/fixtures/eslint-gate/warnings-baseline.json',
      '--dormant-defects',
      'scripts/fixtures/eslint-gate/dormant-defects.json',
      '--behaviour-registry',
      'scripts/fixtures/eslint-gate/behaviours-dormant-on.json',
    ])
    assert.equal(r.status, 0, r.stderr || r.stdout)
    assert.match(r.stdout, /ESLint errors: 0/)
    assert.match(r.stdout, /Known dormant defects \(DORMANT-001\): 1/)
    assert.match(r.stdout, /NOT approved\/clean/)
    assert.match(r.stdout, /E8 — known dormant defect/)
  })

  it('fails if DORMANT-001 is removed while E8 remains', () => {
    const json = writeTempJson([
      {
        filePath: join(root, 'components/ai-annotation/AreaPhotoViewer.jsx'),
        messages: [
          {
            severity: 2,
            ruleId: 'react-hooks/preserve-manual-memoization',
            message: 'Calling a prop inside a state updater is not supported',
            line: 225,
          },
        ],
      },
    ])
    const r = run(gateScript, [
      '--skip-exceptions',
      '--eslint-json',
      json,
      '--warnings-baseline',
      'scripts/fixtures/eslint-gate/warnings-baseline.json',
      '--dormant-defects',
      'scripts/fixtures/eslint-gate/dormant-defects.json',
      '--behaviour-registry',
      'scripts/fixtures/eslint-gate/behaviours-dormant-off.json',
    ])
    assert.equal(r.status, 1, r.stderr || r.stdout)
    assert.match(r.stdout, /ESLint errors: 1/)
    assert.match(r.stderr, /Unapproved ESLint errors/)
    assert.match(r.stderr, /AreaPhotoViewer\.jsx/)
  })

  it('does not let an unrelated file use the dormant E8 exemption', () => {
    const json = writeTempJson([
      {
        filePath: join(root, 'components/photo-workspace/CapturePhotoPreview.jsx'),
        messages: [
          {
            severity: 2,
            ruleId: 'react-hooks/preserve-manual-memoization',
            message: 'Calling a prop inside a state updater is not supported',
            line: 10,
          },
        ],
      },
    ])
    const r = run(gateScript, [
      '--skip-exceptions',
      '--eslint-json',
      json,
      '--warnings-baseline',
      'scripts/fixtures/eslint-gate/warnings-baseline.json',
      '--dormant-defects',
      'scripts/fixtures/eslint-gate/dormant-defects.json',
      '--behaviour-registry',
      'scripts/fixtures/eslint-gate/behaviours-dormant-on.json',
    ])
    assert.equal(r.status, 1, r.stderr || r.stdout)
    assert.match(r.stdout, /ESLint errors: 1/)
    assert.match(r.stderr, /CapturePhotoPreview\.jsx/)
  })

  it('classifies only the exact registered file + rule as dormant', () => {
    const classified = classifyDormantEslintErrors(
      [e8Error(), e8Error('components/photo-workspace/CapturePhotoPreview.jsx')],
      {
        defects: [
          {
            id: 'E8',
            file: 'components/ai-annotation/AreaPhotoViewer.jsx',
            rule: 'react-hooks/preserve-manual-memoization',
            blockedBy: 'DORMANT-001',
          },
        ],
        behaviours: [{ id: 'DORMANT-001' }],
      },
    )
    assert.equal(classified.dormantKnownDefects.length, 1)
    assert.equal(classified.liveErrors.length, 1)
    assert.equal(classified.liveErrors[0].file, 'components/photo-workspace/CapturePhotoPreview.jsx')
  })
})
