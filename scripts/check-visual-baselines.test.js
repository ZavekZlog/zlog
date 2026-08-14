import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const script = join(root, 'scripts/check-visual-baselines.mjs')
const registry = JSON.parse(
  readFileSync(join(root, 'e2e/visual/VISUAL_BASELINE_REGISTRY.json'), 'utf8'),
)

describe('visual baseline registry / inventory gate', () => {
  it('marks dashboard and sign-out as known_regression (must not be blessed)', () => {
    const dash = registry.screens.find((s) => s.id === 'dashboard')
    const signOut = registry.screens.find((s) => s.id === 'dashboard-sign-out')
    assert.equal(dash.status, 'known_regression')
    assert.equal(signOut.status, 'known_regression')
  })

  it('approves only landing and login for initial baselines', () => {
    const approved = registry.screens.filter((s) => s.status === 'approved').map((s) => s.id)
    assert.deepEqual(approved.sort(), ['landing', 'login'])
  })

  it('update path requires intentional command (documented in registry)', () => {
    assert.equal(registry.updateRequires.command, 'npm run test:visual:update')
    assert.equal(registry.updateRequires.envFlag, 'ZLOG_ALLOW_VISUAL_BASELINE_UPDATE')
  })

  it('inventory script exits 0 when no forbidden baselines exist', () => {
    const r = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr || r.stdout)
  })

  it('forbidden baseline files are absent for known_regression screens', () => {
    for (const id of ['dashboard', 'dashboard-sign-out']) {
      for (const vp of ['mobile', 'desktop']) {
        const p = join(root, 'e2e/visual/__baselines__', vp, `${id}.png`)
        assert.equal(existsSync(p), false, `must not exist: ${p}`)
      }
    }
  })
})
