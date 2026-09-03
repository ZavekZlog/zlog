import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const viewerModule = 'components/ai-annotation/AreaPhotoViewer.jsx'
const barrelModule = 'components/ai-annotation/index.js'
const locationWalkPath = 'components/ai-annotation/AiLocationWalk.jsx'

function normalize(p) {
  return String(p || '').replace(/\\/g, '/')
}

function walkJs(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.git') continue
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) walkJs(abs, acc)
    else if (/\.(js|jsx|ts|tsx|mjs)$/.test(name)) acc.push(abs)
  }
  return acc
}

function liveHostFiles() {
  const files = []
  walkJs(join(root, 'app'), files)
  walkJs(join(root, 'components'), files)
  return files.map((abs) => ({
    abs,
    rel: normalize(relative(root, abs)),
    text: readFileSync(abs, 'utf8'),
  }))
}

function namedSpecifiers(clause) {
  return String(clause || '')
    .split(',')
    .map((part) => {
      const raw = part.trim()
      if (!raw || raw === 'type') return ''
      const [binding] = raw.split(/\s+as\s+/i)
      return binding.replace(/^type\s+/, '').trim()
    })
    .filter(Boolean)
}

function fromAreaPhotoViewerModule(fromPath) {
  const n = normalize(fromPath).replace(/['"]/g, '')
  return (
    /AreaPhotoViewer(\.jsx)?$/.test(n) ||
    n.endsWith('/ai-annotation/AreaPhotoViewer')
  )
}

describe('DORMANT-001 — AreaPhotoViewer stays unmounted', () => {
  const hosts = liveHostFiles()

  it('does not render <AreaPhotoViewer in live app/components hosts', () => {
    const hits = hosts.filter(({ rel, text }) => {
      if (rel === viewerModule) return false
      return /<AreaPhotoViewer\b/.test(text) || /<[A-Za-z0-9_]+\.AreaPhotoViewer\b/.test(text)
    })
    assert.deepEqual(
      hits.map((h) => h.rel),
      [],
      'DORMANT-001: AreaPhotoViewer JSX must not be mounted',
    )
  })

  it('does not createElement(AreaPhotoViewer) in live hosts', () => {
    const hits = hosts.filter(({ rel, text }) => {
      if (rel === viewerModule) return false
      return (
        /createElement\(\s*AreaPhotoViewer\b/.test(text) ||
        /React\.createElement\(\s*AreaPhotoViewer\b/.test(text) ||
        /createElement\(\s*[A-Za-z0-9_]+\.AreaPhotoViewer\b/.test(text)
      )
    })
    assert.deepEqual(
      hits.map((h) => h.rel),
      [],
      'DORMANT-001: AreaPhotoViewer must not be created as an element',
    )
  })

  it('does not import AreaPhotoViewer into a live host', () => {
    const hits = []
    for (const { rel, text } of hosts) {
      if (rel === viewerModule) continue
      if (rel === barrelModule) continue
      const importRe =
        /import\s+(?:type\s+)?(?:([A-Za-z0-9_]+)|(?:\*\s+as\s+[A-Za-z0-9_]+)|(?:\{([^}]*)\}))\s+from\s+(['"][^'"]+['"])/g
      let m
      while ((m = importRe.exec(text))) {
        const defaultBind = m[1]
        const named = namedSpecifiers(m[2] || '')
        const fromPath = m[3]
        const fromViewer = fromAreaPhotoViewerModule(fromPath)
        const fromBarrel = /ai-annotation['"]$/.test(fromPath) || /ai-annotation\/index/.test(fromPath)
        if (defaultBind === 'AreaPhotoViewer') hits.push(`${rel}: default import`)
        if (named.includes('AreaPhotoViewer')) hits.push(`${rel}: named import AreaPhotoViewer`)
        if (fromViewer && m[0].includes('* as ')) {
          hits.push(`${rel}: namespace import of AreaPhotoViewer module`)
        }
        if (fromBarrel && named.includes('AreaPhotoViewer')) {
          hits.push(`${rel}: barrel import AreaPhotoViewer`)
        }
        if (fromViewer && defaultBind && defaultBind !== 'PhotosPerPagePicker') {
          hits.push(`${rel}: default import from AreaPhotoViewer module`)
        }
      }
    }
    assert.deepEqual(hits, [], 'DORMANT-001: live hosts must not import AreaPhotoViewer')
  })

  it('still allows PhotosPerPagePicker from the AreaPhotoViewer module', () => {
    const walk = readFileSync(join(root, locationWalkPath), 'utf8')
    assert.match(
      walk,
      /import\s*\{\s*PhotosPerPagePicker\s*\}\s*from\s*['"]@\/components\/ai-annotation\/AreaPhotoViewer['"]/,
    )
    assert.doesNotMatch(
      walk,
      /import\s*\{[^}]*\bAreaPhotoViewer\b[^}]*\}\s*from/,
    )
    assert.match(walk, /<PhotosPerPagePicker\b/)
  })

  it('may keep the existing barrel re-export of the dormant viewer', () => {
    const barrel = readFileSync(join(root, barrelModule), 'utf8')
    assert.match(
      barrel,
      /export\s*\{\s*AreaPhotoViewer,\s*PhotosPerPagePicker\s*\}\s*from\s*['"]@\/components\/ai-annotation\/AreaPhotoViewer['"]/,
    )
    assert.doesNotMatch(barrel, /<AreaPhotoViewer\b/)
  })

  it('AiLocationWalk still mounts CapturePhotoPreview as the live viewer', () => {
    const walk = readFileSync(join(root, locationWalkPath), 'utf8')
    assert.match(
      walk,
      /import\s*\{\s*CapturePhotoPreview\s*\}\s*from\s*['"]@\/components\/photo-workspace\/CapturePhotoPreview['"]/,
    )
    assert.match(walk, /<CapturePhotoPreview\b/)
    assert.doesNotMatch(walk, /<AreaPhotoViewer\b/)
  })
})
