import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sleep } from './sleep.js'

const here = dirname(fileURLToPath(import.meta.url))
const childScript = join(here, 'sleep-lifetime-child.mjs')

function spawnChild(mode) {
  return spawn(process.execPath, [childScript, mode], {
    cwd: here,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
}

function collectChildOutput(child) {
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk)
  })
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })
  return {
    waitForExit: () =>
      new Promise((resolve, reject) => {
        child.on('error', reject)
        child.on('exit', (code, signal) => {
          resolve({ code, signal, stdout, stderr })
        })
      }),
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

describe('sleep event-loop lifetime (production timers)', () => {
  it('A — sleep.js does not unref poll timers', () => {
    const src = readFileSync(join(here, 'sleep.js'), 'utf8')
    assert.doesNotMatch(src, /\.unref\(/)
  })

  it('B — production sleep keeps the process alive until the timer resolves', async () => {
    const child = spawnChild('sleep-only')
    const io = collectChildOutput(child)
    await delay(40)
    assert.equal(child.exitCode, null, 'process must not exit before sleep resolves')
    const result = await io.waitForExit()
    assert.equal(result.code, 0)
    assert.match(result.stdout, /sleep-done/)
  })

  it('C — idle claim loop with production sleep survives empty-queue wait', async () => {
    const child = spawnChild('idle-loop')
    const io = collectChildOutput(child)
    await delay(50)
    assert.equal(child.exitCode, null, 'worker must not exit while idle between claims')
    await delay(90)
    assert.equal(child.exitCode, null, 'worker must remain alive across poll wait')
    child.kill('SIGKILL')
    await io.waitForExit()
  })

  it('E — graceful shutdown flag ends idle loop cleanly', async () => {
    const child = spawnChild('idle-loop-self-stop')
    const io = collectChildOutput(child)
    await delay(50)
    assert.equal(child.exitCode, null, 'worker must keep polling until shutdown is requested')
    const result = await Promise.race([
      io.waitForExit(),
      delay(2000).then(() => {
        throw new Error('child did not exit after shutdown flag')
      }),
    ])
    assert.equal(result.code, 0)
    assert.match(result.stdout, /shutdown-complete/)
  })

  it('D — in-process sleep resolves within expected delay', async () => {
    const started = Date.now()
    await sleep(25)
    assert.ok(Date.now() - started >= 20)
  })
})
