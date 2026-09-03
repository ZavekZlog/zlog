/**
 * Shared helpers for the ESLint exception registry and warning-baseline gate.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { normalizePath, repoRoot } from './scope-files.mjs'

export { repoRoot, normalizePath }

const EXCEPTION_ID_RE = /\bESLINT-[A-Z0-9][A-Z0-9-]*\b/g
const DISABLE_BLOCK_RE =
  /\/\*\s*eslint-disable(?!-next-line|-line)(\s+([^*]*?))?\*\//g
const DISABLE_NEXT_RE =
  /(?:\/\/|\/\*)\s*eslint-disable-next-line(\s+([^\n*]*))?/g
const DISABLE_LINE_RE = /eslint-disable-line(\s+([^\n*]*))?/g
const ENABLE_RE = /\/\*\s*eslint-enable(?:\s+([^*]*?))?\*\//g

export const PHOTO_001_NO_IMG_SURFACES = [
  'app/dashboard/diary/setup/page.jsx',
  'app/dashboard/project/[id]/diary/page.jsx',
  'app/dashboard/project/[id]/diary/view/page.jsx',
  'components/photo-workspace/CapturePhotoPreview.jsx',
  'components/ai-annotation/AreaPhotoViewer.jsx',
  'components/ai-annotation/AiLocationWalk.jsx',
  'components/photo-annotations/PhotoAnnotationEditor.jsx',
]

export function loadJson(relPath, root = repoRoot) {
  return JSON.parse(readFileSync(join(root, relPath), 'utf8'))
}

export function relFromRoot(absPath, root = repoRoot) {
  return normalizePath(relative(root, absPath))
}

export function extractExceptionIds(text) {
  return [...new Set(String(text || '').match(EXCEPTION_ID_RE) || [])]
}

export function parseRuleList(raw) {
  return String(raw || '')
    .split('--')[0]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('ESLINT-'))
}

export function messageKey(message = '', ruleId = '') {
  const first = String(message).split('\n')[0]
  const quoted = first.match(/'([^']+)'/)
  if (quoted) return quoted[1]
  if (ruleId === '@next/next/no-img-element') return 'no-img-element'
  return first.replace(/\s+/g, ' ').trim().slice(0, 160)
}

export function sourceHintFromLine(line = '') {
  return String(line)
    .replace(/\r$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

export function warningFingerprint({ file, rule, message, sourceHint }) {
  return [
    normalizePath(file),
    rule || '',
    messageKey(message, rule),
    sourceHintFromLine(sourceHint),
  ].join('::')
}

export function fingerprintFromBaselineRecord(w) {
  return warningFingerprint({
    file: w.file,
    rule: w.rule,
    message: w.messageKey,
    sourceHint: w.sourceHint,
  })
}

export function fingerprintFromEslintMessage(relFile, msg, fileText) {
  const lines = String(fileText || '').split(/\n/)
  const idx = (msg.line || 1) - 1
  let chunk = lines[idx] || ''
  if (/<img\b/i.test(chunk) || chunk.trim() === '<img') {
    for (let i = idx + 1; i < Math.min(lines.length, idx + 8); i++) {
      chunk += ` ${lines[i] || ''}`
      if (/>/.test(lines[i] || '')) break
    }
  }
  return warningFingerprint({
    file: relFile,
    rule: msg.ruleId,
    message: msg.message,
    sourceHint: chunk,
  })
}

function walkFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.git') continue
    const abs = join(dir, name)
    const st = statSync(abs)
    if (st.isDirectory()) walkFiles(abs, acc)
    else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(name)) acc.push(abs)
  }
  return acc
}

export function listLintableFiles(root = repoRoot) {
  const out = []
  for (const dir of ['app', 'components', 'lib', 'scripts', 'e2e']) {
    walkFiles(join(root, dir), out)
  }
  return out.filter((abs) => {
    const rel = relFromRoot(abs, root)
    if (rel.startsWith('scripts/fixtures/')) return false
    if (rel === 'scripts/lib/eslint-gate.mjs') return false
    if (rel === 'scripts/run-eslint-gate.mjs') return false
    if (rel === 'scripts/check-eslint-exceptions.mjs') return false
    if (rel === 'scripts/check-eslint-gate.test.js') return false
    if (rel.startsWith('scripts/fixtures/eslint-gate/')) return false
    return true
  })
}

/**
 * Find eslint-disable / disable-next-line / disable-line directives.
 * File-wide (no rules, or no matching enable) is flagged as broad.
 */
export function findDisableDirectives(relFile, text) {
  const found = []
  const lines = String(text).split(/\n/)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNo = i + 1
    for (const m of line.matchAll(DISABLE_NEXT_RE)) {
      found.push({
        kind: 'next-line',
        line: lineNo,
        rules: parseRuleList(m[1] || m[2] || ''),
        ids: extractExceptionIds(line),
        raw: m[0],
      })
    }
    for (const m of line.matchAll(DISABLE_LINE_RE)) {
      found.push({
        kind: 'line',
        line: lineNo,
        rules: parseRuleList(m[1] || m[2] || ''),
        ids: extractExceptionIds(line),
        raw: m[0],
      })
    }
  }

  // Block comments may be single-line /* eslint-disable rule -- ESLINT-E1 */
  const blockStarts = []
  let match
  const src = String(text)
  DISABLE_BLOCK_RE.lastIndex = 0
  while ((match = DISABLE_BLOCK_RE.exec(src))) {
    const before = src.slice(0, match.index)
    const line = before.split(/\n/).length
    blockStarts.push({
      index: match.index,
      line,
      rules: parseRuleList(match[1] || match[2] || ''),
      ids: extractExceptionIds(match[0]),
      raw: match[0].replace(/\s+/g, ' ').trim(),
    })
  }

  const enables = []
  ENABLE_RE.lastIndex = 0
  while ((match = ENABLE_RE.exec(src))) {
    enables.push({
      index: match.index,
      line: src.slice(0, match.index).split(/\n/).length,
      rules: parseRuleList(match[1] || ''),
    })
  }

  for (const start of blockStarts) {
    const end = enables.find((e) => e.index > start.index)
    const endLine = end ? end.line : lines.length
    const span = endLine - start.line
    found.push({
      kind: 'block',
      line: start.line,
      endLine,
      span,
      rules: start.rules,
      ids: start.ids,
      raw: start.raw,
      closed: Boolean(end),
    })
  }

  return found.map((d) => ({ ...d, file: relFile }))
}

export function exceptionFiles(ex) {
  const list = ex.files || (ex.file ? [ex.file] : [])
  return [...new Set(list.map(normalizePath))]
}

export function collectDisableProblems({
  root = repoRoot,
  exceptions,
  protectedRules,
  files,
}) {
  const byId = new Map((exceptions || []).map((e) => [e.id, e]))
  const problems = []
  const seenIdFiles = new Map()
  const scan = files || listLintableFiles(root)

  const markSeen = (id, rel) => {
    if (!seenIdFiles.has(id)) seenIdFiles.set(id, new Set())
    seenIdFiles.get(id).add(normalizePath(rel))
  }

  for (const abs of scan) {
    const rel = relFromRoot(abs, root)
    const text = readFileSync(abs, 'utf8')
    const dirs = findDisableDirectives(rel, text)
    for (const d of dirs) {
      const touchesProtected =
        d.rules.length === 0 || d.rules.some((r) => protectedRules.includes(r))
      if (!touchesProtected) continue

      if (d.kind === 'block' && d.rules.length === 0) {
        problems.push({
          code: 'broad-disable',
          file: rel,
          line: d.line,
          detail: 'File/block eslint-disable with no rule list is forbidden',
        })
        continue
      }
      if (d.kind === 'block' && !d.closed) {
        problems.push({
          code: 'unclosed-disable',
          file: rel,
          line: d.line,
          detail: 'eslint-disable block has no matching eslint-enable',
        })
      }
      if (d.kind === 'block' && d.span > 80) {
        problems.push({
          code: 'broad-disable',
          file: rel,
          line: d.line,
          detail: `eslint-disable block spans ${d.span} lines (max 80 without file-wide approval)`,
        })
      }

      if (!d.ids.length) {
        problems.push({
          code: 'unregistered-disable',
          file: rel,
          line: d.line,
          detail: `protected rule disable without ESLINT-* exception ID (${d.rules.join(', ') || 'all'})`,
        })
        continue
      }

      for (const id of d.ids) {
        markSeen(id, rel)
        const ex = byId.get(id)
        if (!ex) {
          problems.push({
            code: 'unknown-id',
            file: rel,
            line: d.line,
            detail: `${id} is not in APPROVED_ESLINT_EXCEPTIONS.json`,
          })
          continue
        }
        const allowed = exceptionFiles(ex)
        if (!allowed.includes(normalizePath(rel))) {
          problems.push({
            code: 'file-mismatch',
            file: rel,
            line: d.line,
            detail: `${id} is registered for ${allowed.join(', ')}`,
          })
        }
        const disableRules = d.rules.length ? d.rules : [ex.rule]
        if (!disableRules.includes(ex.rule)) {
          problems.push({
            code: 'rule-mismatch',
            file: rel,
            line: d.line,
            detail: `${id} is registered for ${ex.rule}`,
          })
        }
      }
    }
  }

  for (const ex of exceptions || []) {
    const allowed = exceptionFiles(ex)
    for (const f of allowed) {
      if (!existsSync(join(root, f))) {
        problems.push({
          code: 'missing-file',
          file: f,
          line: 0,
          detail: `${ex.id} points at missing file`,
        })
      }
    }
    if (!protectedRules.includes(ex.rule)) {
      problems.push({
        code: 'unknown-rule',
        file: allowed[0] || ex.id,
        line: 0,
        detail: `${ex.id} rule ${ex.rule} is not a protected lint rule`,
      })
    }
    const scanRels = files?.map((f) => relFromRoot(f, root))
    const seen = seenIdFiles.get(ex.id) || new Set()
    for (const f of allowed) {
      if (scanRels && !scanRels.includes(f)) continue
      if (!seen.has(f)) {
        problems.push({
          code: 'unused-exception',
          file: f,
          line: 0,
          detail: `${ex.id} is registered but no matching disable comment was found`,
        })
      }
    }
  }

  return problems
}

export function classifyWarningRule(rule) {
  if (rule === '@typescript-eslint/no-unused-vars') return 'no-unused-vars'
  if (rule === 'react-hooks/exhaustive-deps') return 'exhaustive-deps'
  if (rule === '@next/next/no-img-element') return 'no-img-element'
  return rule || 'other'
}

/**
 * Occurrence-aware baseline match. Duplicate fingerprints (same unused binding
 * in two components) cannot hide a third identical warning.
 * Stale baseline entries (removed warnings) are reported but allowed.
 */
export function diffWarningBaselines(currentFingerprints, baselineFingerprints) {
  const remaining = new Map()
  for (const fp of baselineFingerprints) {
    remaining.set(fp, (remaining.get(fp) || 0) + 1)
  }
  const approved = []
  const newWarnings = []
  for (const fp of currentFingerprints) {
    const n = remaining.get(fp) || 0
    if (n > 0) {
      approved.push(fp)
      remaining.set(fp, n - 1)
    } else {
      newWarnings.push(fp)
    }
  }
  const removed = []
  for (const [fp, n] of remaining) {
    for (let i = 0; i < n; i++) removed.push(fp)
  }
  return { approved, newWarnings, removed }
}

export function isPhoto001NoImgSurface(file) {
  return PHOTO_001_NO_IMG_SURFACES.includes(normalizePath(file))
}

export const DORMANT_BEHAVIOUR_ID = 'DORMANT-001'

export function behaviourIsActive(behaviours, id = DORMANT_BEHAVIOUR_ID) {
  return (behaviours || []).some((b) => b && b.id === id)
}

/**
 * Known defects in dormant/unmounted files are not approved exceptions.
 * They are non-blocking only while the blocking behaviour (DORMANT-001) is active
 * and only for the exact registered file + rule.
 */
export function classifyDormantEslintErrors(
  errors,
  { defects = [], behaviours = [], behaviourId = DORMANT_BEHAVIOUR_ID } = {},
) {
  const active = behaviourIsActive(behaviours, behaviourId)
  const liveErrors = []
  const dormantKnownDefects = []
  for (const e of errors || []) {
    const file = normalizePath(e.file)
    const match = (defects || []).find((d) => {
      const blockedBy = d.blockedBy || behaviourId
      return (
        normalizePath(d.file) === file &&
        d.rule === e.rule &&
        blockedBy === behaviourId
      )
    })
    if (match && active) {
      dormantKnownDefects.push({
        ...e,
        dormantId: match.id,
        blockedBy: match.blockedBy || behaviourId,
      })
    } else {
      liveErrors.push(e)
    }
  }
  return { liveErrors, dormantKnownDefects, dormantBehaviourActive: active }
}
