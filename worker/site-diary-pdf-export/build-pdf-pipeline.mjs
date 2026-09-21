import esbuild from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')
const entry = join(here, 'pdf-pipeline-probe.mjs')
const outdir = join(here, 'dist')
const outfile = join(outdir, 'pdf-pipeline-probe.mjs')

/** Runtime packages — not bundled (native / heavy / shared with Next install). */
const EXTERNAL_PACKAGES = [
  'sharp',
  '@supabase/supabase-js',
  '@react-pdf/renderer',
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
]

function serverOnlyShimPlugin() {
  return {
    name: 'zlog-worker-server-only-shim',
    setup(build) {
      build.onResolve({ filter: /^server-only$/ }, () => ({
        path: 'server-only',
        namespace: 'zlog-server-only-empty',
      }))
      build.onLoad({ filter: /.*/, namespace: 'zlog-server-only-empty' }, () => ({
        contents: 'export {}\n',
        loader: 'js',
      }))
    },
  }
}

async function main() {
  await mkdir(outdir, { recursive: true })

  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    jsx: 'automatic',
    logLevel: 'info',
    absWorkingDir: repoRoot,
    alias: {
      '@': repoRoot,
    },
    plugins: [serverOnlyShimPlugin()],
    external: EXTERNAL_PACKAGES,
  })

  console.log('[worker-pdf-build] Wrote', outfile)
}

main().catch((err) => {
  console.error('[worker-pdf-build] Failed:', err?.message || err)
  process.exit(1)
})
