/**
 * Shared dirty-tree / path helpers for anti-regression gates.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

export function normalizePath(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
}

export function listDirtyFiles(cwd = repoRoot) {
  const r = spawnSync('git', ['status', '--porcelain', '-uall'], {
    cwd,
    encoding: 'utf8',
    shell: false,
  })
  if (r.error) throw new Error(`git failed to start: ${r.error.message}`)
  if (r.status !== 0) throw new Error(`git status failed: ${r.stderr || r.stdout}`)
  const files = []
  for (const line of (r.stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue
    const rest = line.slice(3)
    const arrow = rest.indexOf(' -> ')
    const pathPart = arrow >= 0 ? rest.slice(arrow + 4) : rest
    files.push(normalizePath(pathPart.replace(/^"|"$/g, '')))
  }
  return [...new Set(files)]
}

export function globToRegExp(glob) {
  return new RegExp(
    `^${normalizePath(glob)
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, ':::DS:::')
      .replace(/\*/g, '[^/]*')
      .replace(/:::DS:::/g, '.*')}$`,
  )
}

export function pathMatchesPrefix(file, prefix) {
  const f = normalizePath(file)
  const p = normalizePath(prefix)
  if (f === p || f.startsWith(p)) return true
  if (!p.endsWith('/') && f.startsWith(`${p}/`)) return true
  return false
}

export function pathMatchesAny(file, prefixes = [], globs = []) {
  const f = normalizePath(file)
  for (const p of prefixes) {
    if (pathMatchesPrefix(f, p)) return true
  }
  for (const g of globs) {
    if (globToRegExp(g).test(f)) return true
  }
  return false
}

/** Infra / tests that may lock protected behaviour without being product UI. */
export function isGateExemptFile(file) {
  const f = normalizePath(file)
  if (/\.(test|spec)\.(js|jsx|ts|tsx|mjs)$/.test(f)) return true
  if (f.startsWith('e2e/')) return true
  if (f.startsWith('scripts/')) return true
  if (f.startsWith('supabase/.temp/')) return true
  if (f === 'playwright.config.js' || f === 'playwright.config.ts') return true
  if (f === 'docs/PROTECTED_CODE_BOUNDARIES.json') return true
  if (f === 'docs/PROTECTED_CODE_BOUNDARIES.md') return true
  if (f === 'docs/PROTECTED_SCOPE_MANIFEST.json') return true
  if (f === 'docs/ANTI_REGRESSION_ENFORCEMENT.md') return true
  if (f === 'docs/contracts/APPROVED_BEHAVIOUR_REGISTRY.json') return true
  if (f === 'docs/contracts/APPROVED_UI_COPY.json') return true
  if (f === 'docs/contracts/APPROVED_ESLINT_EXCEPTIONS.json') return true
  if (f === 'docs/contracts/APPROVED_ESLINT_WARNINGS.json') return true
  if (f === 'docs/contracts/DORMANT_ESLINT_DEFECTS.json') return true
  if (f === 'docs/ZLOG_RELEASE_GATE.md') return true
  if (f === 'eslint.config.mjs') return true
  if (f.startsWith('.cursor/rules/')) return true
  if (f === 'package.json') return true
  if (f === '.gitignore') return true
  if (f === '.zlog-task-scope.json') return true
  return false
}

/** Product / schema / app surface files that count toward change budget. */
export function isProductFile(file) {
  const f = normalizePath(file)
  if (isGateExemptFile(f)) return false
  if (f.startsWith('docs/')) return false
  if (f.startsWith('.next/')) return false
  if (f.startsWith('supabase/.temp/')) return false
  if (f.startsWith('test-results/') || f.startsWith('playwright-report/')) return false
  return true
}

export function loadJson(relPath) {
  const p = join(repoRoot, relPath)
  if (!existsSync(p)) throw new Error(`Missing ${relPath}`)
  return JSON.parse(readFileSync(p, 'utf8'))
}

export function loadScopeManifest() {
  return loadJson('docs/PROTECTED_SCOPE_MANIFEST.json')
}

export function loadTaskScopeDeclaration({ ignoreFile = false } = {}) {
  const fromEnv = (process.env.ZLOG_TASK_SCOPE || '').trim()
  const reasonEnv = (process.env.ZLOG_TASK_SCOPE_REASON || '').trim()
  const extraEnv = (process.env.ZLOG_TASK_SCOPE_EXTRA_FILES || '')
    .split(',')
    .map((s) => normalizePath(s.trim()))
    .filter(Boolean)

  const ignoreScopeFile =
    ignoreFile ||
    process.env.ZLOG_IGNORE_SCOPE_FILE === '1' ||
    process.env.ZLOG_IGNORE_SCOPE_FILE === 'true'

  const filePath = join(repoRoot, '.zlog-task-scope.json')
  let fromFile = null
  if (!ignoreScopeFile && existsSync(filePath)) {
    fromFile = JSON.parse(readFileSync(filePath, 'utf8'))
  }

  const scope = fromEnv || (fromFile && fromFile.scope) || ''
  const reason =
    reasonEnv || (fromFile && String(fromFile.reason || '').trim()) || ''
  const extraFiles = [
    ...extraEnv,
    ...((fromFile && fromFile.extraFiles) || []).map(normalizePath),
  ]
  const approvalNote =
    (process.env.ZLOG_TASK_SCOPE_APPROVAL || '').trim() ||
    (fromFile && String(fromFile.approvalNote || '').trim()) ||
    ''
  const allowLargeDiff =
    process.env.ZLOG_ALLOW_LARGE_DIFF === '1' ||
    process.env.ZLOG_ALLOW_LARGE_DIFF === 'true' ||
    Boolean(fromFile && fromFile.allowLargeDiff)
  const largeDiffReason =
    (process.env.ZLOG_LARGE_DIFF_REASON || '').trim() ||
    (fromFile && String(fromFile.largeDiffReason || '').trim()) ||
    ''
  const allowProtectedScope =
    process.env.ZLOG_ALLOW_PROTECTED_SCOPE === '1' ||
    process.env.ZLOG_ALLOW_PROTECTED_SCOPE === 'true' ||
    Boolean(fromFile && fromFile.allowProtectedScope)
  const protectedScopeReason =
    (process.env.ZLOG_PROTECTED_SCOPE_REASON || '').trim() ||
    (fromFile && String(fromFile.protectedScopeReason || '').trim()) ||
    ''

  return {
    scope: String(scope || '').trim(),
    reason,
    extraFiles: [...new Set(extraFiles)],
    approvalNote,
    allowLargeDiff,
    largeDiffReason,
    allowProtectedScope,
    protectedScopeReason,
    source: fromEnv ? 'env' : fromFile ? 'file' : 'none',
  }
}
