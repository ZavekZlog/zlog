/**
 * Defect #3C — final Save must persist the authoritative writer publication,
 * not a render closure that is still on P3.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  autosavePayloadsEqual,
  buildDiaryAutosavePayload,
  diaryAutosaveOperationOwner,
  diaryAutosaveOwnersEqual,
} from './diary-autosave.js'
import { applyCoverPhotoPatch } from './diary-cover-photo.js'
import { labourFormToPersistRows } from './diary-save-dirty.js'

const workbenchSource = readFileSync(
  join(import.meta.dirname, '..', 'components/site-diary/SiteDiaryWorkbenchSurface.jsx'),
  'utf8',
)
const labourSource = readFileSync(
  join(import.meta.dirname, '..', 'components/diary/useSiteDiaryLabour.js'),
  'utf8',
)
const editorSource = readFileSync(
  join(import.meta.dirname, '..', 'components/site-diary/SiteDiaryWorkbenchProjectDetailsEditor.jsx'),
  'utf8',
)
const walkSource = readFileSync(
  join(import.meta.dirname, '..', 'components/ai-annotation/AiLocationWalk.jsx'),
  'utf8',
)
const detailsControllerSource = readFileSync(
  join(import.meta.dirname, 'use-site-diary-project-details.js'),
  'utf8',
)

const p3Labour = [{ trade: 'P3 labour', count: 1, hours: 1, company: 'Old', notes: '' }]
const p4Labour = [{ trade: 'P4 labour', count: 11, hours: 66.75, company: 'New', notes: '' }]
const p3Walk = [{ id: 'area-p3', areaName: 'P3 area', photos: [] }]
const p4Walk = [{ id: 'area-p4', areaName: 'P4 area', photos: [{ storagePath: 'p4.jpg' }] }]

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.ok(start >= 0, `missing ${startMarker}`)
  assert.ok(end > start, `missing ${endMarker}`)
  return source.slice(start, end)
}

function compileArrow(source, names) {
  const factory = new Function(
    ...names,
    `"use strict"; return (${source});`,
  )
  return (values) => factory(...names.map((name) => values[name]))
}

function snapshotBlock() {
  return sliceBetween(
    workbenchSource,
    'const reportPayload = applyCoverPhotoPatch(',
    'const sequenced = flattenAreaGroups(walkForPersist)',
  )
}

function runSnapshot(overrides = {}) {
  const names = [
    'applyCoverPhotoPatch',
    'projectId',
    'reportDate',
    'weather',
    'shiftType',
    'siteSummary',
    'visitors',
    'visitorsRegisterProvenance',
    'normalizeVisitorsRegisterProvenance',
    'delaysIssues',
    'actionsRequired',
    'companyReportingFor',
    'creatorName',
    'creatorRole',
    'signatureUrl',
    'equipmentHirePayload',
    'equipmentHireRows',
    'hsIncidentsPayload',
    'hsIncidents',
    'rfisPayload',
    'rfis',
    'variationsPayload',
    'variations',
    'temporaryWorksApplicable',
    'temporaryWorksPayload',
    'temporaryWorks',
    'brandingPayload',
    'brandingSelection',
    'coverPlan',
    'labourFormToPersistRows',
    'labourRows',
    'editingReportId',
    'plantFormToPersistRows',
    'plantRows',
    'authoritativeLabourPayload',
    'labourRowsRef',
    'plantRowsRef',
    'temporaryWorksRef',
    'projectDetailsAuthorityRef',
    'latestPayloadRef',
    'coverPhotoRef',
    'signatureRef',
    'equipmentHireRowsRef',
    'saveOwner',
    'diaryAutosaveOwnersEqual',
  ]
  const values = {
    applyCoverPhotoPatch,
    projectId: 'project-a',
    reportDate: '2026-01-01',
    weather: 'P3 weather',
    shiftType: 'Day',
    siteSummary: 'P3 summary',
    visitors: '',
    visitorsRegisterProvenance: [],
    normalizeVisitorsRegisterProvenance: (value) => value || [],
    delaysIssues: '',
    actionsRequired: '',
    companyReportingFor: 'P3 company',
    creatorName: 'P3 author',
    creatorRole: 'P3 role',
    signatureUrl: null,
    equipmentHirePayload: (rows) => rows,
    equipmentHireRows: [],
    hsIncidentsPayload: (rows) => rows,
    hsIncidents: [],
    rfisPayload: (rows) => rows,
    rfis: [],
    variationsPayload: (rows) => rows,
    variations: [],
    temporaryWorksApplicable: null,
    temporaryWorksPayload: (rows) => rows,
    temporaryWorks: [],
    brandingPayload: (selection) => (selection ? {
      branding_id: selection.brandingId || null,
      brand_color: selection.brandColor || null,
      brand_logo_url: selection.brandLogoUrl || null,
    } : {}),
    brandingSelection: { brandingId: 'brand-p3', brandColor: '#111111', brandLogoUrl: 'logo-p3.png' },
    coverPlan: {},
    labourFormToPersistRows,
    labourRows: p3Labour,
    editingReportId: 'report-a',
    plantFormToPersistRows: (rows) => rows,
    plantRows: [{ plant_type: 'P3 plant' }],
    authoritativeLabourPayload: null,
    labourRowsRef: { current: p3Labour },
    plantRowsRef: { current: [{ plant_type: 'P3 plant' }] },
    temporaryWorksRef: { current: [] },
    projectDetailsAuthorityRef: { current: null },
    latestPayloadRef: { current: buildDiaryAutosavePayload({ weather: 'P3 weather' }) },
    coverPhotoRef: { current: null },
    signatureRef: { current: null },
    equipmentHireRowsRef: { current: [] },
    saveOwner: diaryAutosaveOperationOwner({
      reportId: 'report-a',
      projectId: 'project-a',
      generation: 1,
    }),
    diaryAutosaveOwnersEqual,
    ...overrides,
  }
  const factory = new Function(
    ...names,
    `"use strict"; return (function () {\n${snapshotBlock()}\nreturn { reportPayload, labourPayload, plantPayload }\n});`,
  )
  return factory(...names.map((name) => values[name]))()
}

function photoWalkBlock() {
  const marked = workbenchSource.indexOf('// begin authoritative-photo-walk')
  if (marked >= 0) {
    return sliceBetween(
      workbenchSource,
      '// begin authoritative-photo-walk',
      '// end authoritative-photo-walk',
    ).replace('// begin authoritative-photo-walk', '')
  }
  const line = sliceBetween(workbenchSource, 'let walkForPersist = locationWalk', '\n')
  return line
}

function runPhotoWalk({ locationWalk, authoritativePhotoWalk = null, childWalk = null }) {
  const names = ['locationWalk', 'authoritativePhotoWalk', 'childWalk']
  const factory = new Function(
    ...names,
    `"use strict"; return (function () {\nlet walkForPersist = locationWalk\nlet areaFlush = null\n${photoWalkBlock()}\nreturn walkForPersist\n});`,
  )
  return factory(locationWalk, authoritativePhotoWalk, childWalk)()
}

function callbackArrow(source, header) {
  const start = source.indexOf(header)
  assert.ok(start >= 0, `missing ${header}`)
  const arrowAt = source.indexOf('=> {', start)
  assert.ok(arrowAt > start, `arrow missing for ${header}`)
  let depth = 0
  let end = arrowAt
  for (let i = arrowAt; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  return source.slice(arrowAt + 3, end)
}

describe('Defect #3C — writer publication freshness', () => {
  it('TEST 1 — final Save labour is the in-flight Apply payload, not closure P3', () => {
    const p4Payload = labourFormToPersistRows(p4Labour, 'report-a')
    const snapshot = runSnapshot({ authoritativeLabourPayload: p4Payload })
    const trades = snapshot.labourPayload.map((row) => row.trade)
    assert.deepEqual(trades, ['P4 labour'])
    assert.equal(trades.includes('P3 labour'), false)
  })

  it('TEST 2 — manual labour success uses the resolved payload; failure does not finalize P3', () => {
    const p4Payload = labourFormToPersistRows(p4Labour, 'report-a')
    const snapshot = runSnapshot({ authoritativeLabourPayload: p4Payload })
    assert.equal(snapshot.labourPayload[0].trade, 'P4 labour')
    assert.equal(snapshot.labourPayload[0].hours, 66.75)

    const failed = workbenchSource.indexOf('authoritativeLabourFailed')
    assert.ok(failed >= 0, 'manual/apply failure must stop final Save before the RPC')
    const guard = sliceBetween(
      workbenchSource,
      'if (authoritativeLabourFailed)',
      '\n',
    )
    assert.match(guard, /return/)
  })

  it('TEST 3 — Project Details RPC fields come from the sync publication, not closure P3', () => {
    const snapshot = runSnapshot({
      projectDetailsAuthorityRef: {
        current: {
          reportId: 'report-a',
          owner: diaryAutosaveOperationOwner({
            reportId: 'report-a',
            projectId: 'project-a',
            generation: 1,
          }),
          reportDate: '2026-09-29',
          shiftType: 'Night',
          creatorName: 'P4 author',
          creatorRole: 'P4 role',
          companyReportingFor: 'P4 company',
          currentPhase: 'P4 phase',
          brandingSelection: {
            brandingId: 'brand-p4',
            brandColor: '#445566',
            brandLogoUrl: 'logo-p4.png',
            companyName: 'P4 reporting',
          },
          coverPhoto: { storagePath: 'covers/p4.jpg' },
          sync: {
            reportId: 'report-a',
            reportDate: '2026-09-29',
            shiftType: 'Night',
            creatorName: 'P4 author',
            creatorRole: 'P4 role',
            companyReportingFor: 'P4 company',
            currentPhase: 'P4 phase',
            brandingSelection: {
              brandingId: 'brand-p4',
              brandColor: '#445566',
              brandLogoUrl: 'logo-p4.png',
              companyName: 'P4 reporting',
            },
            coverPhoto: { storagePath: 'covers/p4.jpg' },
          },
        },
      },
      coverPlan: { patch: { cover_photo_url: 'covers/p4.jpg' } },
    })
    const report = snapshot.reportPayload
    assert.equal(report.shift, 'Night')
    assert.equal(report.report_date, '2026-09-29')
    assert.equal(report.creator_name, 'P4 author')
    assert.equal(report.creator_role, 'P4 role')
    assert.equal(report.company_reporting_for, 'P4 company')
    assert.notEqual(report.current_phase, 'P3 phase')
    assert.equal(report.branding_id, 'brand-p4')
    assert.equal(report.brand_logo_url, 'logo-p4.png')
    assert.equal(report.cover_photo_url, 'covers/p4.jpg')
  })

  it('TEST 4 — Project Details failure is a hard stop before the RPC', () => {
    assert.match(
      workbenchSource,
      /if \(authoritativeDetailsFailed\)[\s\S]{0,180}return/,
    )
  })

  it('TEST 5 — photo reconcile uses the Save Area walk, not stale Workbench P3', () => {
    const walk = runPhotoWalk({
      locationWalk: p3Walk,
      authoritativePhotoWalk: p4Walk,
      childWalk: p3Walk,
    })
    assert.equal(walk[0].areaName, 'P4 area')
    assert.notEqual(walk[0].id, 'area-p3')
  })

  it('TEST 6 — a just-settled Save Area walk on the child ref beats Workbench P3', () => {
    const walk = runPhotoWalk({
      locationWalk: p3Walk,
      authoritativePhotoWalk: null,
      childWalk: p4Walk,
    })
    assert.equal(walk[0].areaName, 'P4 area')
  })
})

describe('Defect #3C — report-write lock', () => {
  it('TEST 7 — new Apply, manual save, Project Details save, and Save Area do not start', () => {
    assert.match(labourSource, /reportWriteLockedRef\?\.current/)
    assert.match(labourSource, /labourApplyPromiseRef/)
    assert.match(labourSource, /manualLabourPromiseRef/)
    assert.match(editorSource, /reportWriteLockedRef\?\.current/)
    assert.match(walkSource, /diaryReportWriteLockBridge/)
    const applyBody = callbackArrow(labourSource, 'const applyScanOperativesToLabour = useCallback(')
    assert.match(applyBody, /reportWriteLockedRef/)
    const manualBody = callbackArrow(labourSource, 'const saveManualLabourChanges = useCallback(')
    assert.match(manualBody, /reportWriteLockedRef/)
    assert.match(walkSource, /if \(diaryReportWriteLockBridge\.current\?\.current\) return/)
  })

  it('TEST 7b — signature stroke consults the lock ref before mutating', () => {
    const body = callbackArrow(workbenchSource, 'const onEndStroke = () => {')
    assert.match(body, /reportWriteLockedRef\.current/)
    const names = [
      'reportWriteLockedRef',
      'dismissAutosaveSuccessClaim',
      'invalidatePreparedSharePdf',
      'pad',
      'canvas',
      'rebindPadIfNeeded',
      'setSignature',
      'signatureReplaceBackupRef',
      'setSignatureReplacing',
      'setSignatureMode',
      'File',
      'URL',
    ]
    const calls = []
    const fn = compileArrow(`() => {${body}}`, names)({
      reportWriteLockedRef: { current: true },
      dismissAutosaveSuccessClaim: () => calls.push('dismiss'),
      invalidatePreparedSharePdf: () => calls.push('invalidate'),
      pad: { isEmpty: () => false, off() {}, on() {} },
      canvas: {
        style: {},
        toBlob(callback) { callback(new Blob(['x'])) },
      },
      rebindPadIfNeeded: () => {},
      setSignature: () => calls.push('setSignature'),
      signatureReplaceBackupRef: { current: null },
      setSignatureReplacing: () => {},
      setSignatureMode: () => {},
      File,
      URL,
    })
    fn()
    assert.equal(calls.includes('setSignature'), false)
  })

  it('TEST 8 — the diary fieldset is disabled while the report-write lock is on', () => {
    const fieldset = workbenchSource.indexOf('<fieldset')
    assert.ok(fieldset >= 0)
    const clause = workbenchSource.slice(fieldset, workbenchSource.indexOf('>', fieldset))
    const expr = clause.match(/disabled=\{([^}]+)\}/)
    assert.ok(expr, 'fieldset disabled expression missing')
    const disabled = new Function(
      'isDiaryViewMode',
      'reportWriteLocked',
      `return (${expr[1]})`,
    )(false, true)
    assert.equal(disabled, true)
  })
})

function artifactTail() {
  const anchor = "diarySaveLog('success', { reportId: saved.id })"
  const anchorAt = workbenchSource.indexOf(anchor)
  assert.ok(anchorAt >= 0)
  const end = workbenchSource.indexOf('} catch (err) {', anchorAt)
  assert.ok(end > anchorAt)
  return workbenchSource.slice(anchorAt, end)
}

function runArtifactTail(env) {
  const names = Object.keys(env)
  const factory = new Function(
    ...names,
    `"use strict"; return (async () => {\n${artifactTail()}\n});`,
  )
  return factory(...names.map((name) => env[name]))()
}

function artifactEnv(overrides = {}) {
  const stages = []
  const bumpGenerationOnFingerprint = { current: false }
  const reportWriteLockedRef = { current: true }
  const pdfPrepareGenerationRef = { current: 2 }
  const latest = buildDiaryAutosavePayload({ weather: 'P4 storm' })
  const acked = buildDiaryAutosavePayload({ weather: 'P3 wind' })
  const env = {
    diarySaveLog: () => {},
    saved: { id: 'report-a' },
    reportWriteOwner: { reportId: 'report-a', projectId: 'project-a', generation: 1 },
    releaseDeferredReportWriteAutosave: async () => ({ ok: true }),
    pdfPrepareGenerationRef,
    pdfPrepareAbortRef: { current: null },
    localAutosaveMutationRevisionRef: { current: 4 },
    editingReportId: 'report-a',
    editingReportIdRef: { current: 'report-a' },
    saveLockRef: { current: true },
    completingRef: { current: true },
    finalSaveInProgressRef: { current: true },
    flushSync: (fn) => fn(),
    setSaving: (value) => stages.push(['setSaving', value]),
    setPdfPreparing: (value) => stages.push(['setPdfPreparing', value]),
    setReportWriteLocked: (value) => {
      reportWriteLockedRef.current = value
      stages.push(['setReportWriteLocked', value])
    },
    reportWriteLockedRef,
    latestPayloadRef: { current: latest },
    ackedSnapshotRef: { current: acked },
    autosavePayloadsEqual,
    fetchAuthoritativeSiteDiaryPdfExportFingerprint: async () => {
      stages.push(['fingerprint', reportWriteLockedRef.current])
      if (bumpGenerationOnFingerprint.current) pdfPrepareGenerationRef.current += 1
      return { ok: true, contentFingerprint: 'f'.repeat(64) }
    },
    retainPreparedFile: false,
    shareReadyPdfRef: { current: null },
    isWorkbenchSharePrepared: () => false,
    preparedFileMatchesFingerprint: () => true,
    emitShareDiag: () => {},
    projectId: 'project-a',
    setShareReady: (value) => stages.push(['setShareReady', value]),
    setError: (value) => stages.push(['setError', value]),
    persistUiErrorRef: { current: '' },
    failSave: (message) => {
      reportWriteLockedRef.current = false
      stages.push(['failSave', message, reportWriteLockedRef.current])
    },
    failPdfAfterSave: (message) => stages.push(['failPdf', message]),
    userMessageForSiteDiaryPdfExportFailure: (result) => result?.message || 'pdf-failed',
    joinBackgroundInFlight: false,
    pdfBackgroundPrepareSchedulerRef: { current: null },
    canShareSiteDiaryPdfViaNativeFile: () => false,
    postHydratePdfReconcileRef: { current: null },
    postHydrateReconcileArtifactJoinMatches: () => false,
    workbenchShareEntryToPreparedResult: () => null,
    trimPdfExportId: (value) => value || '',
    trimPdfFingerprint: (value) => value || '',
    supabase: {},
    hydrateShareReadyArtifactFromExportIdentity: async () => ({ ok: false }),
    tapStartedAt: 1,
    tapUserActivation: {},
    runSiteDiaryPdfExportToShareReadyArtifact: async () => {
      stages.push('enqueue')
      return { ok: false }
    },
    runSiteDiaryPdfExportToExportReady: async () => {
      stages.push('enqueue')
      return {
        ok: true,
        handoff: 'export-ready',
        reportId: 'report-a',
        exportId: 'export-1',
        fileName: 'Zlog-Site-Diary.pdf',
        title: 'Site Diary',
        text: 'Site Diary',
        contentFingerprint: 'f'.repeat(64),
      }
    },
    isSiteDiaryPdfExportUserAbortResult: () => false,
    snapshotUserActivation: () => ({}),
    console,
    canNativeShare: () => false,
    SITE_DIARY_PDF_EXPORT_HANDOFF: { fileReady: 'file-ready', exportReady: 'export-ready' },
    stages,
    ...overrides,
  }
  return { env, stages, reportWriteLockedRef, bumpGenerationOnFingerprint }
}

describe('Defect #3C — deferred persistence and unlock', () => {
  it('TEST 9 — the form unlocks before fingerprint, and a later edit is not adopted', async () => {
    const harness = artifactEnv()
    harness.bumpGenerationOnFingerprint.current = true
    await runArtifactTail(harness.env)
    const fingerprint = harness.stages.find((stage) => Array.isArray(stage) && stage[0] === 'fingerprint')
    assert.ok(fingerprint, 'fingerprint still runs for a clean deferred flush')
    assert.equal(fingerprint[1], false, 'report-write lock must be clear before fingerprint')
    assert.equal(harness.env.shareReadyPdfRef.current, null)
    assert.equal(harness.stages.some((stage) => Array.isArray(stage) && stage[0] === 'setShareReady' && stage[1] === true), false)
  })

  it('TEST 10 — a failed required deferred flush does not fingerprint or become Report Ready', async () => {
    const harness = artifactEnv({
      releaseDeferredReportWriteAutosave: async () => ({ ok: false, reason: 'update-failed' }),
    })
    await runArtifactTail(harness.env)
    assert.equal(harness.stages.some((stage) => Array.isArray(stage) && stage[0] === 'fingerprint'), false)
    assert.equal(harness.stages.includes('enqueue'), false)
    assert.equal(harness.stages.some((stage) => Array.isArray(stage) && stage[0] === 'setShareReady' && stage[1] === true), false)
    assert.equal(harness.reportWriteLockedRef.current, false)
    assert.equal(harness.stages.some((stage) => Array.isArray(stage) && stage[0] === 'failSave'), true)
    assert.equal(harness.env.latestPayloadRef.current.weather, 'P4 storm')
    assert.notEqual(
      harness.env.latestPayloadRef.current.weather,
      harness.env.ackedSnapshotRef.current.weather,
    )
  })

  it('TEST 11 — a non-success flush does not block when the latest payload already matches the ack', async () => {
    const clean = buildDiaryAutosavePayload({ weather: 'P3 wind' })
    const harness = artifactEnv({
      releaseDeferredReportWriteAutosave: async () => ({ ok: false, reason: 'already-saved' }),
    })
    harness.env.latestPayloadRef.current = clean
    harness.env.ackedSnapshotRef.current = clean
    await runArtifactTail(harness.env)
    assert.equal(harness.stages.some((stage) => Array.isArray(stage) && stage[0] === 'fingerprint'), true)
    assert.equal(harness.stages.some((stage) => Array.isArray(stage) && stage[0] === 'failSave'), false)
  })

  it('TEST 12 — a clean Save still fingerprints', async () => {
    const clean = buildDiaryAutosavePayload({ weather: 'P3 wind' })
    const harness = artifactEnv()
    harness.env.latestPayloadRef.current = clean
    harness.env.ackedSnapshotRef.current = clean
    await runArtifactTail(harness.env)
    assert.equal(harness.stages.some((stage) => Array.isArray(stage) && stage[0] === 'fingerprint'), true)
    assert.equal(harness.reportWriteLockedRef.current, false)
  })

  it('TEST 13 — a report switch during the barrier does not let report A authority become report B', () => {
    assert.match(workbenchSource, /editingReportIdRef\.current/)
    assert.match(
      workbenchSource,
      /editingReportIdRef\.current[\s\S]{0,120}saveReportId/,
    )
  })
})

function lifecycleOwner(reportId, generation) {
  return diaryAutosaveOperationOwner({
    reportId,
    projectId: 'project-a',
    generation,
  })
}

function bindProduction(source, header, values) {
  const start = source.indexOf(header)
  assert.ok(start >= 0, `missing ${header}`)
  const arrowAt = source.indexOf('=> {', start)
  assert.ok(arrowAt > start, `arrow missing for ${header}`)
  const paren = source.lastIndexOf('(', arrowAt)
  const asyncPrefix = /\basync\s*$/.test(source.slice(start, paren)) ? 'async ' : ''
  const params = `${asyncPrefix}${source.slice(paren, arrowAt + 2)}`
  return compileArrow(`${params} ${callbackArrow(source, header)}`, Object.keys(values))(values)
}

function runCapture(values) {
  const body = sliceBetween(
    workbenchSource,
    'const saveReportId = editingReportId',
    'reportWriteOwner = autosaveLifecycleOwnerRef.current',
  )
  const names = [
    'editingReportId',
    'labourScan',
    'projectDetailsPersistRef',
    'projectDetailsAuthorityRef',
    'locationWalkRef',
    'autosaveLifecycleOwnerRef',
    'diaryAutosaveOperationOwner',
    'diaryAutosaveOwnersEqual',
  ]
  const factory = new Function(
    ...names,
    `"use strict"; return (function () {\n${body}\nreturn { saveReportId, capturedLabourApplyPromise, capturedManualLabourPromise, capturedDetailsPromise, detailsAuthorityBeforeWriters, capturedAreaPromise, childWalk, saveOwner: typeof saveOwner === 'undefined' ? null : saveOwner }\n});`,
  )
  return factory(...names.map((name) => values[name]))()
}

function loadWriterBarrier() {
  const start = workbenchSource.indexOf('async function awaitSaveTimeWriterBarrier')
  const end = workbenchSource.indexOf('\nexport default function SiteDiaryWorkbenchSurface')
  assert.ok(start >= 0 && end > start)
  const factory = new Function(
    'diaryAutosaveOwnersEqual',
    `"use strict";\n${workbenchSource.slice(start, end)}\nreturn awaitSaveTimeWriterBarrier`,
  )
  return factory(diaryAutosaveOwnersEqual)
}

function areaHandle(state) {
  const start = walkSource.indexOf('useImperativeHandle(ref, () => ({')
  const end = walkSource.indexOf('}), [', start)
  assert.ok(start >= 0 && end > start)
  const literal = walkSource.slice(start + 'useImperativeHandle(ref, () => ('.length, end + 1)
  const names = [
    'openFirstIncompletePhoto',
    'commitUnsavedAreaForShare',
    'photoWorkspaceDraftDirty',
    'walkRef',
    'areaPersistPromiseRef',
    'authoritativeWalkRef',
    'diaryAutosaveOwnersEqual',
  ]
  const factory = new Function(...names, `"use strict"; return (${literal})`)
  return factory(
    () => {},
    async () => ({ ok: true }),
    false,
    state.walkRef,
    state.areaPersistPromiseRef,
    state.authoritativeWalkRef,
    diaryAutosaveOwnersEqual,
  )
}

function applyScope(overrides) {
  return {
    reportWriteLockedRef: { current: false },
    isSignInOcrApplyEnabled: () => true,
    scanOcrProvider: 'test',
    scanApplyEnabled: true,
    setScanApplySaved() {},
    setScanApplyNotice() {},
    setScanApplyError() {},
    applyTradeHoursReviewToLabourSummary: () => ({
      ok: true,
      rows: p4Labour,
      totals: { workers: 11, hours: 66.75 },
      message: '',
    }),
    scanTradeHoursReviewRef: { current: [] },
    makeUuid: () => 'row-1',
    flushSync(run) { run() },
    setScanApplySaving() {},
    setLabourRows() {},
    dismissAutosaveSuccessClaim() {},
    invalidatePreparedSharePdf() {},
    supabase: {},
    projectId: 'project-a',
    publishedLabourPayloadRef: { current: null },
    scanLifecycleRevisionRef: { current: 1 },
    scanRequestIdRef: { current: 1 },
    scanLifecycleReportIdRef: { current: 'report-a' },
    lastPersistedLabourRef: { current: null },
    LABOUR_APPLY_SAVE_FAIL_MESSAGE: 'apply-failed',
    reportLifecycleOwnerRef: { current: null },
    labourApplyInFlightTokenRef: { current: null },
    diaryAutosaveOperationOwner,
    diaryAutosaveOwnersEqual,
    ...overrides,
  }
}

function p4DetailsSync() {
  return {
    reportDate: '2026-09-29',
    shiftType: 'Night',
    creatorName: 'P4 author',
    creatorRole: 'P4 role',
    companyReportingFor: 'P4 company',
    currentPhase: 'P4 phase',
    brandingSelection: {
      brandingId: 'brand-p4',
      brandColor: '#445566',
      brandLogoUrl: 'logo-p4.png',
    },
    projectReference: 'P4-ref',
    logoPreviewUrl: '',
  }
}

function detailsSyncBindings(state) {
  const noop = () => {}
  return {
    projectDetailsAuthorityRef: state.projectDetailsAuthorityRef,
    editingReportIdRef: state.editingReportIdRef,
    autosaveLifecycleOwnerRef: state.autosaveLifecycleOwnerRef || { current: null },
    markLocalAutosaveMutation: state.markLocalAutosaveMutation || noop,
    setCreatorName: state.setCreatorName || noop,
    setCreatorRole: state.setCreatorRole || noop,
    setCompanyReportingFor: state.setCompanyReportingFor || noop,
    setShiftType: state.setShiftType || noop,
    setReportDate: state.setReportDate || noop,
    setProjectReference: state.setProjectReference || noop,
    setBrandingSelection: state.setBrandingSelection || noop,
    setSetupLogoPreview: state.setSetupLogoPreview || noop,
    coverPhotoRef: state.coverPhotoRef || { current: null },
    setCoverPhoto: state.setCoverPhoto || noop,
    loadedCoverPathRef: state.loadedCoverPathRef || { current: null },
    project: Object.prototype.hasOwnProperty.call(state, 'project') ? state.project : null,
    setProject: state.setProject || noop,
    lastPersistedReportRef: state.lastPersistedReportRef || { current: null },
    invalidatePreparedSharePdf: state.invalidatePreparedSharePdf || noop,
    diaryAutosaveOperationOwner,
    diaryAutosaveOwnersEqual,
  }
}

function staleDetailsPayload() {
  return {
    ...p4DetailsSync(),
    logoPreviewUrl: 'logo-a.png',
    coverPhoto: { storagePath: 'cover-a.jpg', preview: 'blob:cover-a' },
    projectRowPatch: { name: 'A project' },
    relinquishEditorCover() {},
  }
}

function trackProjectDetailsSetters() {
  const calls = []
  const note = (name) => () => { calls.push(name) }
  const lastPersistedReportRef = {
    current: {
      shift: 'Day',
      current_phase: 'Current phase',
      creator_name: 'Current author',
      report_date: '2026-09-01',
    },
  }
  const project = { name: 'Current project' }
  return {
    calls,
    lastPersistedReportRef,
    project,
    spies: {
      setShiftType: note('shift'),
      setReportDate: note('reportDate'),
      setCreatorName: note('author'),
      setCreatorRole: note('role'),
      setCompanyReportingFor: note('company'),
      setBrandingSelection: note('branding'),
      setSetupLogoPreview: note('logo'),
      setCoverPhoto: note('cover'),
      setProject: note('project'),
      markLocalAutosaveMutation: note('mutation'),
      invalidatePreparedSharePdf: note('invalidate'),
    },
  }
}

async function settleWriter() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => { setTimeout(resolve, 0) })
}

describe('Defect #3C — writer lifecycle ownership', () => {
  it('TEST 15 — report A Labour Apply cannot feed report B', async () => {
    const ownerA = lifecycleOwner('report-a', 1)
    const ownerB = lifecycleOwner('report-b', 2)
    const labourApplyPromiseRef = { current: null }
    const publishedLabourPayloadRef = { current: null }
    let resolvePersist
    const persistAppliedLabourRows = () => new Promise((resolve) => {
      resolvePersist = resolve
    })
    const apply = bindProduction(labourSource, 'const applyScanOperativesToLabour = useCallback(', applyScope({
      editingReportId: 'report-a',
      labourApplyInFlightRef: { current: false },
      labourApplyPromiseRef,
      publishedLabourPayloadRef,
      reportLifecycleOwnerRef: { current: ownerA },
      persistAppliedLabourRows,
    }))
    apply({ preventDefault() {}, stopPropagation() {} })
    const captured = runCapture({
      editingReportId: 'report-b',
      labourScan: {
        labourApplyPromiseRef,
        manualLabourPromiseRef: { current: null },
      },
      projectDetailsPersistRef: { current: null },
      projectDetailsAuthorityRef: { current: null },
      locationWalkRef: { current: null },
      autosaveLifecycleOwnerRef: { current: ownerB },
      diaryAutosaveOperationOwner,
      diaryAutosaveOwnersEqual,
    })
    resolvePersist(labourFormToPersistRows(p4Labour, 'report-a'))
    await Promise.resolve()
    const barrier = await loadWriterBarrier()({
      labourWriters: [captured.capturedLabourApplyPromise, captured.capturedManualLabourPromise].filter(Boolean),
      detailsPromise: captured.capturedDetailsPromise,
      detailsBefore: captured.detailsAuthorityBeforeWriters,
      areaPromise: captured.capturedAreaPromise,
      editingReportIdRef: { current: 'report-b' },
      saveReportId: 'report-b',
      projectDetailsAuthorityRef: { current: null },
      saveOwner: ownerB,
      lifecycleOwnerRef: { current: ownerB },
    })
    const snapshot = runSnapshot({
      authoritativeLabourPayload: barrier.authoritativeLabourPayload,
      editingReportId: 'report-b',
      labourRows: p3Labour,
      labourRowsRef: { current: p3Labour },
      saveOwner: ownerB,
    })
    assert.equal(snapshot.labourPayload[0].trade, 'P3 labour')
    assert.equal(snapshot.labourPayload.some((row) => row.trade === 'P4 labour'), false)
    const published = publishedLabourPayloadRef.current
    assert.notEqual(published?.reportId, 'report-b')
    if (published?.owner) {
      assert.equal(diaryAutosaveOwnersEqual(published.owner, ownerA), true)
      assert.equal(diaryAutosaveOwnersEqual(published.owner, ownerB), false)
    }
  })

  it('TEST 16 — old labour completion cannot clear a newer writer', async () => {
    const ownerA = lifecycleOwner('report-a', 1)
    const ownerB = lifecycleOwner('report-b', 2)
    const labourApplyPromiseRef = { current: null }
    const labourApplyInFlightRef = { current: false }
    const reportLifecycleOwnerRef = { current: ownerA }
    const scanLifecycleReportIdRef = { current: 'report-a' }
    const pending = []
    const persistAppliedLabourRows = () => new Promise((resolve) => {
      pending.push(resolve)
    })
    const apply = (reportId) => bindProduction(
      labourSource,
      'const applyScanOperativesToLabour = useCallback(',
      applyScope({
        editingReportId: reportId,
        labourApplyInFlightRef,
        labourApplyPromiseRef,
        reportLifecycleOwnerRef,
        scanLifecycleReportIdRef,
        persistAppliedLabourRows,
      }),
    )({ preventDefault() {}, stopPropagation() {} })
    apply('report-a')
    const writerA = labourApplyPromiseRef.current
    assert.ok(writerA, 'report A Apply must retain a writer')
    const switchLifecycle = bindProduction(
      labourSource.slice(labourSource.indexOf('const scanLifecycleReportIdRef = useRef(editingReportId)')),
      'useLayoutEffect(',
      {
        scanLifecycleReportIdRef,
        editingReportId: 'report-b',
        scanLifecycleRevisionRef: { current: 1 },
        clearSignInSheetWorkingState() {},
        setSignInSheetStoragePath() {},
        loadedSignInSheetPathRef: { current: null },
        setScanSignInPreviewLoadError() {},
        signInSheetRemovedRef: { current: false },
        setLabourModeState() {},
        setManualLabourEditing() {},
        manualLabourSnapshotRef: { current: null },
        setScanApplySaving() {},
        labourApplyInFlightRef,
        labourApplyInFlightTokenRef: { current: null },
        labourApplyPromiseRef,
        manualLabourPromiseRef: { current: null },
      },
    )
    switchLifecycle()
    reportLifecycleOwnerRef.current = ownerB
    apply('report-b')
    const writerB = labourApplyPromiseRef.current
    assert.notEqual(writerB, null)
    assert.notEqual(writerB, writerA)
    pending[0](labourFormToPersistRows(p4Labour, 'report-a'))
    await Promise.resolve()
    await Promise.resolve()
    assert.equal(labourApplyPromiseRef.current, writerB)
  })

  it('TEST 17 — report A Save Area cannot feed report B', async () => {
    const ownerA = lifecycleOwner('report-a', 1)
    const ownerB = lifecycleOwner('report-b', 2)
    let resolveArea
    const areaPromise = new Promise((resolve) => {
      resolveArea = resolve
    })
    const state = {
      walkRef: { current: p4Walk },
      areaPersistPromiseRef: { current: areaPromise },
      authoritativeWalkRef: {
        current: { owner: ownerA, locationWalk: p4Walk },
      },
    }
    const handle = areaHandle(state)
    const captured = runCapture({
      editingReportId: 'report-b',
      labourScan: {
        labourApplyPromiseRef: { current: null },
        manualLabourPromiseRef: { current: null },
      },
      projectDetailsPersistRef: { current: null },
      projectDetailsAuthorityRef: { current: null },
      locationWalkRef: { current: handle },
      autosaveLifecycleOwnerRef: { current: ownerB },
      diaryAutosaveOperationOwner,
      diaryAutosaveOwnersEqual,
    })
    resolveArea({ ok: true, locationWalk: p4Walk })
    const barrier = await loadWriterBarrier()({
      labourWriters: [],
      detailsPromise: captured.capturedDetailsPromise,
      detailsBefore: captured.detailsAuthorityBeforeWriters,
      areaPromise: captured.capturedAreaPromise,
      editingReportIdRef: { current: 'report-b' },
      saveReportId: 'report-b',
      projectDetailsAuthorityRef: { current: null },
      saveOwner: ownerB,
      lifecycleOwnerRef: { current: ownerB },
    })
    const walk = runPhotoWalk({
      locationWalk: p3Walk,
      authoritativePhotoWalk: barrier.authoritativePhotoWalk,
      childWalk: captured.childWalk,
    })
    assert.equal(walk[0].areaName, 'P3 area')
    assert.notEqual(walk[0].id, 'area-p4')
    const asked = handle.getAuthoritativeWalk(ownerB)
    assert.equal(asked, null)
  })

  it('TEST 18 — Project Details completion after a report switch stays owned by A', () => {
    const ownerA = lifecycleOwner('report-a', 1)
    const ownerB = lifecycleOwner('report-b', 2)
    const projectDetailsAuthorityRef = { current: null }
    const projectDetailsPersistRef = { current: null }
    const detailsWriterOwnerRef = { current: null }
    const reportLifecycleOwnerRef = { current: ownerA }
    const editingReportIdRef = { current: 'report-a' }
    const saveDetails = bindProduction(
      editorSource,
      'const saveProjectDetails = useCallback(',
      {
        reportWriteLockedRef: { current: false },
        persistProjectDetails: () => Promise.resolve(true),
        projectDetailsPersistRef,
        reportLifecycleOwnerRef,
        detailsWriterOwnerRef,
        diaryAutosaveOperationOwner,
      },
    )
    saveDetails()
    reportLifecycleOwnerRef.current = ownerB
    editingReportIdRef.current = 'report-b'
    const publish = bindProduction(
      workbenchSource,
      'const handleWorkbenchProjectDetailsSync = useCallback(',
      detailsSyncBindings({ projectDetailsAuthorityRef, editingReportIdRef }),
    )
    const onSuccess = bindProduction(
      editorSource,
      'const handlePersistSuccess = useCallback(',
      {
        applyProjectDetailsPersistToWorkbench: () => p4DetailsSync(),
        onWorkbenchPersistSync: publish,
        onCollapse() {},
        detailsWriterOwnerRef,
        diaryAutosaveOperationOwner,
      },
    )
    onSuccess({ ok: true })
    assert.equal(
      diaryAutosaveOwnersEqual(projectDetailsAuthorityRef.current?.owner, ownerA),
      true,
    )
    assert.equal(
      diaryAutosaveOwnersEqual(projectDetailsAuthorityRef.current?.owner, ownerB),
      false,
    )
    const snapshot = runSnapshot({
      projectDetailsAuthorityRef,
      editingReportId: 'report-b',
      saveOwner: ownerB,
      shiftType: 'Day',
      reportDate: '2026-09-01',
      creatorName: 'B author',
      creatorRole: 'B role',
      companyReportingFor: 'B company',
    })
    assert.equal(snapshot.reportPayload.shift, 'Day')
    assert.equal(snapshot.reportPayload.creator_name, 'B author')
  })

  it('TEST 19 — a same-report reload generation cannot reuse older Project Details authority', () => {
    const stale = lifecycleOwner('report-a', 1)
    const current = lifecycleOwner('report-a', 2)
    const p4 = p4DetailsSync()
    const snapshot = runSnapshot({
      projectDetailsAuthorityRef: {
        current: {
          reportId: 'report-a',
          owner: stale,
          ...p4,
          sync: { reportId: 'report-a', ...p4 },
        },
      },
      editingReportId: 'report-a',
      saveOwner: current,
      shiftType: 'Day',
      reportDate: '2026-09-01',
      creatorName: 'P5 author',
      creatorRole: 'P5 role',
      companyReportingFor: 'P5 company',
    })
    assert.equal(snapshot.reportPayload.shift, 'Day')
    assert.equal(snapshot.reportPayload.report_date, '2026-09-01')
    assert.equal(snapshot.reportPayload.creator_name, 'P5 author')
    assert.equal(snapshot.reportPayload.creator_role, 'P5 role')
    assert.equal(snapshot.reportPayload.company_reporting_for, 'P5 company')
    assert.notEqual(snapshot.reportPayload.shift, 'Night')
  })

  it('TEST 20 — the same lifecycle Project Details publication is still consumed without a render', () => {
    const ownerA = lifecycleOwner('report-a', 1)
    const projectDetailsAuthorityRef = { current: null }
    const editingReportIdRef = { current: 'report-a' }
    const publish = bindProduction(
      workbenchSource,
      'const handleWorkbenchProjectDetailsSync = useCallback(',
      detailsSyncBindings({ projectDetailsAuthorityRef, editingReportIdRef }),
    )
    publish(p4DetailsSync(), ownerA)
    const snapshot = runSnapshot({
      projectDetailsAuthorityRef,
      editingReportId: 'report-a',
      saveOwner: ownerA,
      shiftType: 'Day',
      reportDate: '2026-01-01',
      creatorName: 'P3 author',
      creatorRole: 'P3 role',
      companyReportingFor: 'P3 company',
    })
    assert.equal(snapshot.reportPayload.shift, 'Night')
    assert.equal(snapshot.reportPayload.report_date, '2026-09-29')
    assert.equal(snapshot.reportPayload.creator_name, 'P4 author')
    assert.equal(snapshot.reportPayload.branding_id, 'brand-p4')
  })

  it('TEST 21 — a new lifecycle does not wait on an old writer', async () => {
    const ownerB = lifecycleOwner('report-b', 2)
    let releaseOld
    const oldWriter = new Promise((resolve) => {
      releaseOld = resolve
    })
    const labourApplyPromiseRef = { current: oldWriter }
    const reportWriteLockedRef = { current: true }
    try {
      const captured = runCapture({
        editingReportId: 'report-b',
        labourScan: {
          labourApplyPromiseRef,
          manualLabourPromiseRef: { current: null },
        },
        projectDetailsPersistRef: { current: null },
        projectDetailsAuthorityRef: { current: null },
        locationWalkRef: { current: null },
        autosaveLifecycleOwnerRef: { current: ownerB },
        diaryAutosaveOperationOwner,
        diaryAutosaveOwnersEqual,
      })
      const raced = await Promise.race([
        loadWriterBarrier()({
          labourWriters: [captured.capturedLabourApplyPromise].filter(Boolean),
          detailsPromise: null,
          detailsBefore: null,
          areaPromise: null,
          editingReportIdRef: { current: 'report-b' },
          saveReportId: 'report-b',
          projectDetailsAuthorityRef: { current: null },
          saveOwner: ownerB,
          lifecycleOwnerRef: { current: ownerB },
        }).then(() => 'done'),
        new Promise((resolve) => {
          setTimeout(() => resolve('waited'), 40)
        }),
      ])
      assert.equal(raced, 'done')
      assert.equal(labourApplyPromiseRef.current, oldWriter)
      assert.equal(reportWriteLockedRef.current, true)
    } finally {
      releaseOld(labourFormToPersistRows(p4Labour, 'report-a'))
    }
  })
})

describe('Defect #3C — late writer publication ownership', () => {
  function completeProjectDetails(startOwner, currentOwner) {
    const tracked = trackProjectDetailsSetters()
    const projectDetailsAuthorityRef = { current: null }
    const projectDetailsPersistRef = { current: null }
    const detailsWriterOwnerRef = { current: null }
    const detailsStartOwnerQueueRef = { current: [] }
    const lifecycleRef = { current: startOwner }
    const editingReportIdRef = { current: startOwner.reportId }
    const collapses = []
    const saveDetails = bindProduction(
      editorSource,
      'const saveProjectDetails = useCallback(',
      {
        reportWriteLockedRef: { current: false },
        persistProjectDetails: () => Promise.resolve(true),
        projectDetailsPersistRef,
        reportLifecycleOwnerRef: lifecycleRef,
        detailsWriterOwnerRef,
        detailsStartOwnerQueueRef,
        diaryAutosaveOperationOwner,
        diaryAutosaveOwnersEqual,
      },
    )
    const publish = bindProduction(
      workbenchSource,
      'const handleWorkbenchProjectDetailsSync = useCallback(',
      detailsSyncBindings({
        projectDetailsAuthorityRef,
        editingReportIdRef,
        autosaveLifecycleOwnerRef: lifecycleRef,
        lastPersistedReportRef: tracked.lastPersistedReportRef,
        project: tracked.project,
        coverPhotoRef: { current: { storagePath: 'cover-current.jpg', preview: 'blob:current' } },
        ...tracked.spies,
      }),
    )
    const onSuccess = bindProduction(
      editorSource,
      'const handlePersistSuccess = useCallback(',
      {
        applyProjectDetailsPersistToWorkbench: () => staleDetailsPayload(),
        onWorkbenchPersistSync: publish,
        onCollapse() { collapses.push('collapse') },
        detailsWriterOwnerRef,
        detailsStartOwnerQueueRef,
        reportLifecycleOwnerRef: lifecycleRef,
        diaryAutosaveOperationOwner,
        diaryAutosaveOwnersEqual,
      },
    )
    saveDetails()
    lifecycleRef.current = currentOwner
    editingReportIdRef.current = currentOwner.reportId
    return {
      tracked,
      projectDetailsAuthorityRef,
      detailsWriterOwnerRef,
      detailsStartOwnerQueueRef,
      collapses,
      onSuccess,
    }
  }

  it('TEST 22 — Project Details old success cannot mutate report B', () => {
    const ownerA = lifecycleOwner('report-a', 1)
    const ownerB = lifecycleOwner('report-b', 2)
    const run = completeProjectDetails(ownerA, ownerB)
    const phaseBefore = run.tracked.lastPersistedReportRef.current.current_phase
    run.onSuccess({ ok: true })
    assert.deepEqual(run.tracked.calls, [])
    assert.deepEqual(run.collapses, [])
    assert.equal(run.tracked.lastPersistedReportRef.current.current_phase, phaseBefore)
    assert.equal(run.tracked.lastPersistedReportRef.current.shift, 'Day')
    assert.equal(
      diaryAutosaveOwnersEqual(run.projectDetailsAuthorityRef.current?.owner, ownerB),
      false,
    )
  })

  it('TEST 23 — Project Details same-report old generation cannot mutate A/g2', () => {
    const ownerG1 = lifecycleOwner('report-a', 1)
    const ownerG2 = lifecycleOwner('report-a', 2)
    const run = completeProjectDetails(ownerG1, ownerG2)
    run.onSuccess({ ok: true })
    assert.deepEqual(run.tracked.calls, [])
    assert.deepEqual(run.collapses, [])
    assert.equal(run.tracked.lastPersistedReportRef.current.current_phase, 'Current phase')
    assert.equal(
      diaryAutosaveOwnersEqual(run.projectDetailsAuthorityRef.current?.owner, ownerG2),
      false,
    )
    if (run.projectDetailsAuthorityRef.current?.owner) {
      assert.equal(
        diaryAutosaveOwnersEqual(run.projectDetailsAuthorityRef.current.owner, ownerG1),
        true,
      )
    }
  })

  it('TEST 24 — Project Details immutable start owner', () => {
    const ownerA = lifecycleOwner('report-a', 1)
    const ownerB = lifecycleOwner('report-b', 2)
    const run = completeProjectDetails(ownerA, ownerA)
    run.detailsWriterOwnerRef.current = ownerB
    run.onSuccess({ ok: true })
    assert.equal(
      diaryAutosaveOwnersEqual(run.projectDetailsAuthorityRef.current?.owner, ownerA),
      true,
    )
    assert.equal(
      diaryAutosaveOwnersEqual(run.projectDetailsAuthorityRef.current?.owner, ownerB),
      false,
    )
  })

  function areaPublicationHarness(startOwner, currentOwner) {
    const calls = []
    const walkRef = { current: [{ id: 'area-current', areaName: 'Current area', photos: [] }] }
    const draftPhotosRef = { current: [{ id: 'draft-current' }] }
    const authoritativeWalkRef = {
      current: { owner: currentOwner, locationWalk: walkRef.current },
    }
    const bridge = { current: { current: currentOwner } }
    const persist = bindProduction(
      walkSource,
      'const persistCommittedArea = useCallback(',
      {
        onAreaSaved: async () => ({ ok: true, locationWalk: p4Walk }),
        onChange(walk) { calls.push(['onChange', walk]) },
        walkRef,
        setPhotoError(message) { calls.push(['error', message]) },
        draftPhotosRef,
        authoritativeWalkRef,
        diaryReportLifecycleOwnerBridge: bridge,
        diaryAutosaveOwnersEqual,
        diaryAutosaveOperationOwner,
      },
    )
    const apply = bindProduction(
      walkSource,
      'const applyCommittedArea = useCallback(',
      {
        draftPhotosRef,
        setDraftPhotos() { calls.push('draft') },
        setLastSaved() { calls.push('saved') },
        setEditingGroupId() { calls.push('editing') },
        setDescriptionDraft() { calls.push('description') },
        clearFieldErrors() { calls.push('clear') },
        setPhase(phase) { calls.push(['phase', phase]) },
        layoutToPerPage: () => 2,
      },
    )
    const finalize = bindProduction(
      walkSource,
      'const finalizeAreaSave = useCallback(',
      {
        persistCommittedArea: persist,
        applyCommittedArea: apply,
      },
    )
    return {
      calls,
      walkRef,
      draftPhotosRef,
      authoritativeWalkRef,
      finalize,
      result: {
        ok: true,
        committed: true,
        clearedDraft: true,
        saved: { id: 'area-p4', areaName: 'P4 area', photos: [], layout: 'two' },
        locationWalk: p4Walk,
        areaPublicationOwner: startOwner,
      },
    }
  }

  it('TEST 25 — Save Area old success cannot update report B', async () => {
    const ownerA = lifecycleOwner('report-a', 1)
    const ownerB = lifecycleOwner('report-b', 2)
    const run = areaPublicationHarness(ownerA, ownerB)
    const authoritativeBefore = run.authoritativeWalkRef.current
    await run.finalize(run.result)
    assert.deepEqual(run.calls, [])
    assert.equal(run.walkRef.current[0].areaName, 'Current area')
    assert.equal(run.draftPhotosRef.current[0].id, 'draft-current')
    assert.equal(run.authoritativeWalkRef.current, authoritativeBefore)
    assert.equal(
      diaryAutosaveOwnersEqual(run.authoritativeWalkRef.current?.owner, ownerB),
      true,
    )
  })

  it('TEST 26 — Save Area old generation cannot update same report A/g2', async () => {
    const ownerG1 = lifecycleOwner('report-a', 1)
    const ownerG2 = lifecycleOwner('report-a', 2)
    const run = areaPublicationHarness(ownerG1, ownerG2)
    await run.finalize(run.result)
    assert.deepEqual(run.calls, [])
    assert.equal(run.walkRef.current[0].areaName, 'Current area')
    assert.equal(run.draftPhotosRef.current[0].id, 'draft-current')
    assert.equal(
      diaryAutosaveOwnersEqual(run.authoritativeWalkRef.current?.owner, ownerG2),
      true,
    )
  })

  it('TEST 27 — labour old completion after same-report reload', async () => {
    const ownerG1 = lifecycleOwner('report-a', 1)
    const ownerG2 = lifecycleOwner('report-a', 2)
    const reportLifecycleOwnerRef = { current: ownerG1 }
    const lastPersistedLabourRef = { current: null }
    const labourApplyInFlightRef = { current: false }
    const labourApplyPromiseRef = { current: null }
    const manualLabourPromiseRef = { current: null }
    const notices = []
    const errors = []
    const manualEdits = []
    const manualErrors = []
    let resolveApply
    let rejectApply
    const apply = bindProduction(
      labourSource,
      'const applyScanOperativesToLabour = useCallback(',
      applyScope({
        editingReportId: 'report-a',
        labourApplyInFlightRef,
        labourApplyPromiseRef,
        reportLifecycleOwnerRef,
        lastPersistedLabourRef,
        setScanApplyNotice(message) { notices.push(message) },
        setScanApplyError(message) { errors.push(message) },
        persistAppliedLabourRows: () => new Promise((resolve, reject) => {
          resolveApply = resolve
          rejectApply = reject
        }),
      }),
    )
    apply({ preventDefault() {}, stopPropagation() {} })
    reportLifecycleOwnerRef.current = ownerG2
    resolveApply(labourFormToPersistRows(p4Labour, 'report-a'))
    await settleWriter()
    assert.equal(lastPersistedLabourRef.current, null)
    assert.equal(notices.some((message) => String(message).includes('saved')), false)
    assert.equal(errors.includes('apply-failed'), false)

    reportLifecycleOwnerRef.current = ownerG1
    labourApplyInFlightRef.current = false
    apply({ preventDefault() {}, stopPropagation() {} })
    reportLifecycleOwnerRef.current = ownerG2
    rejectApply(new Error('stale apply'))
    await settleWriter()
    assert.equal(lastPersistedLabourRef.current, null)
    assert.equal(errors.includes('apply-failed'), false)

    const manualSnapshot = { current: [{ trade: 'kept' }] }
    let resolveManual
    const saveManual = bindProduction(
      labourSource,
      'const saveManualLabourChanges = useCallback(',
      applyScope({
        editingReportId: 'report-a',
        reportLifecycleOwnerRef,
        lastPersistedLabourRef,
        manualLabourPromiseRef,
        manualLabourSnapshotRef: manualSnapshot,
        _labourRows: p4Labour,
        setManualLabourSaving() {},
        setManualLabourEditing(value) { manualEdits.push(value) },
        setManualLabourSaveError(message) { manualErrors.push(message) },
        persistAppliedLabourRows: () => new Promise((resolve) => {
          resolveManual = resolve
        }),
      }),
    )
    reportLifecycleOwnerRef.current = ownerG1
    saveManual()
    reportLifecycleOwnerRef.current = ownerG2
    resolveManual(labourFormToPersistRows(p4Labour, 'report-a'))
    await settleWriter()
    assert.equal(lastPersistedLabourRef.current, null)
    assert.equal(manualEdits.includes(false), false)
    assert.equal(manualSnapshot.current[0].trade, 'kept')
    assert.equal(manualErrors.includes('apply-failed'), false)
  })

  it('TEST 28 — same-lifecycle completion still publishes normally', async () => {
    const ownerA = lifecycleOwner('report-a', 1)
    const details = completeProjectDetails(ownerA, ownerA)
    details.onSuccess({ ok: true })
    assert.equal(details.tracked.calls.includes('shift'), true)
    assert.equal(details.tracked.calls.includes('author'), true)
    assert.equal(details.tracked.calls.includes('invalidate'), true)
    assert.equal(details.collapses.length, 1)
    assert.equal(details.tracked.lastPersistedReportRef.current.shift, 'Night')
    assert.equal(
      diaryAutosaveOwnersEqual(details.projectDetailsAuthorityRef.current?.owner, ownerA),
      true,
    )

    const area = areaPublicationHarness(ownerA, ownerA)
    await area.finalize(area.result)
    assert.equal(area.calls.some((call) => call[0] === 'onChange'), true)
    assert.equal(area.calls.some((call) => Array.isArray(call) && call[1] === 'after_save'), true)
    assert.equal(area.walkRef.current[0].id, 'area-p4')

    const lastPersistedLabourRef = { current: null }
    const notices = []
    let resolveApply
    const apply = bindProduction(
      labourSource,
      'const applyScanOperativesToLabour = useCallback(',
      applyScope({
        editingReportId: 'report-a',
        labourApplyInFlightRef: { current: false },
        labourApplyPromiseRef: { current: null },
        reportLifecycleOwnerRef: { current: ownerA },
        lastPersistedLabourRef,
        setScanApplyNotice(message) { notices.push(message) },
        persistAppliedLabourRows: () => new Promise((resolve) => {
          resolveApply = resolve
        }),
      }),
    )
    apply({ preventDefault() {}, stopPropagation() {} })
    resolveApply(labourFormToPersistRows(p4Labour, 'report-a'))
    await settleWriter()
    assert.equal(lastPersistedLabourRef.current[0].trade, 'P4 labour')
    assert.equal(notices.some((message) => String(message).includes('saved')), true)
  })
})

describe('Defect #3C — stale completion publication', () => {
  function areaBaselineHarness(startOwner, switchTo) {
    const calls = []
    const lifecycleRef = { current: startOwner }
    const baseline = { current: { marker: 'current-baseline' } }
    const bridge = { current: lifecycleRef }
    const handleAreaSaved = bindProduction(
      workbenchSource,
      'const handleAreaSaved = useCallback(',
      {
        editingReportId: startOwner.reportId,
        verifyDiaryWorkbenchAuthUser: async () => ({ status: 'authenticated', user: { id: 'user-1' } }),
        supabase: { auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } },
        markSessionExpired() {},
        SESSION_EXPIRED_SAVE_MESSAGE: 'expired',
        SAVE_AREA_PERSIST_FAIL_MESSAGE: 'save-area-failed',
        locationWalk: p4Walk,
        persistSaveAreaGroup: async () => {
          if (switchTo) lifecycleRef.current = switchTo
          return { ok: true, locationWalk: p4Walk }
        },
        lastPersistedPhotosRef: baseline,
        durablePhotosToBaseline: () => ({ marker: 'a-baseline' }),
        flattenAreaGroups: (walk) => walk,
        autosaveLifecycleOwnerRef: lifecycleRef,
        diaryAutosaveOwnersEqual,
        diaryAutosaveOperationOwner,
      },
    )
    const walkRef = { current: [{ id: 'area-current', areaName: 'Current area', photos: [] }] }
    const draftPhotosRef = { current: [{ id: 'draft-current' }] }
    const persist = bindProduction(
      walkSource,
      'const persistCommittedArea = useCallback(',
      {
        onAreaSaved: handleAreaSaved,
        onChange(walk) { calls.push(['onChange', walk]) },
        walkRef,
        setPhotoError(message) { calls.push(['error', message]) },
        draftPhotosRef,
        authoritativeWalkRef: { current: { owner: startOwner, locationWalk: walkRef.current } },
        diaryReportLifecycleOwnerBridge: bridge,
        diaryAutosaveOwnersEqual,
        diaryAutosaveOperationOwner,
      },
    )
    const apply = bindProduction(
      walkSource,
      'const applyCommittedArea = useCallback(',
      {
        draftPhotosRef,
        setDraftPhotos() { calls.push('draft') },
        setLastSaved() { calls.push('saved') },
        setEditingGroupId() { calls.push('editing') },
        setDescriptionDraft() { calls.push('description') },
        clearFieldErrors() { calls.push('clear') },
        setPhase(phase) { calls.push(['phase', phase]) },
        layoutToPerPage: () => 2,
      },
    )
    const finalize = bindProduction(
      walkSource,
      'const finalizeAreaSave = useCallback(',
      {
        persistCommittedArea: persist,
        applyCommittedArea: apply,
      },
    )
    return {
      calls,
      baseline,
      walkRef,
      draftPhotosRef,
      finalize,
      result: {
        ok: true,
        committed: true,
        clearedDraft: true,
        saved: { id: 'area-p4', areaName: 'P4 area', photos: [{ storagePath: 'p4.jpg' }], layout: 'two' },
        locationWalk: p4Walk,
        areaPublicationOwner: startOwner,
      },
    }
  }

  function controllerPersistHarness(startOwner, switchTo, { fail = false, replaceToken = false } = {}) {
    const calls = []
    const lifecycleRef = { current: startOwner }
    const detailsPersistTokenRef = { current: null }
    const note = (name) => (value) => { calls.push([name, value]) }
    const persist = bindProduction(
      detailsControllerSource,
      'const runContinuePersistence = async (',
      {
        saving: false,
        commitReady: true,
        setError: note('error'),
        setProjectDatesError: note('dates'),
        setStickyFieldsError: note('workingDays'),
        setSaving: note('saving'),
        editingReportId: startOwner.reportId,
        editingProjectId: 'project-a',
        NEW_PROJECT_VALUE: '__new__',
        selectedProjectId: 'project-a',
        buildDiarySetupContinueForm: (form) => form,
        projectName: 'Current project',
        author: 'Current author',
        reportingOnBehalfOf: 'Current company',
        reportDate: '2026-09-01',
        projectStartDate: '2026-01-01',
        projectPlannedCompletionDate: '2026-12-01',
        workingDaysPerWeek: '5',
        authorRole: 'Current role',
        shift: 'Day',
        currentPhase: 'Current phase',
        projectAddress: 'Current address',
        projectManager: 'Current manager',
        projectReference: 'Current-ref',
        logoStoragePath: 'logos/current.png',
        brandingId: 'brand-current',
        brandColor: '#000000',
        reportingCompany: 'Current company',
        existingProjects: [],
        projectNameInputRef: { current: null },
        authorInputRef: { current: null },
        reportingOnBehalfOfInputRef: { current: null },
        reportDateInputRef: { current: null },
        validateDiarySetupContinue: () => ({ ok: true }),
        supabase: { auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } },
        logoFile: null,
        uploadLogoIfNeeded: async () => 'logos/current.png',
        extractBrandColorFromFile: async () => '#112233',
        SETUP_BRAND_COLOR_FALLBACK: '#445566',
        persistReportingCompanyIdentity: async () => {
          if (switchTo) lifecycleRef.current = switchTo
          if (replaceToken) detailsPersistTokenRef.current = { newer: true }
          return {
            brandingId: 'brand-a',
            brandColor: '#111111',
            brandLogoUrl: 'logos/a.png',
            companyName: 'A Co',
          }
        },
        setBrandingId: note('brandingId'),
        setBrandColor: note('brandColor'),
        setLogoStoragePath: note('logoStoragePath'),
        runDiarySetupContinue: async () => (
          fail
            ? { ok: false, message: 'Could not save project and report details', field: 'dates' }
            : { ok: true, reportId: startOwner.reportId, projectId: 'project-a' }
        ),
        persistSetupProject: async () => ({ ok: true }),
        createDiaryDraftFromSetup: async () => ({ ok: true }),
        updateDiarySetupFields: async () => ({ ok: true }),
        writeReportSetupExtras: async () => {},
        clearSetupFormDraft() {},
        coverRemoved: false,
        coverPhoto: null,
        putPendingCover: async () => ({ ok: true }),
        newCoverPendingGeneration: () => 1,
        persistCanonicalCoverUpload: async () => ({ storagePath: 'cover-a.jpg' }),
        mergeSiteDiarySessionSnapshot() {},
        buildExistingDiaryContinueSdscSnapshot: () => ({}),
        router: { push() {} },
        onPersistSuccess() { calls.push(['sync']) },
        logoPreview: 'logos/current.png',
        editorOwnedCoverPreviewRef: { current: null },
        persistSignedInAuthorProfile: () => Promise.resolve(),
        reportLifecycleOwnerRef: lifecycleRef,
        detailsPersistTokenRef,
        diaryAutosaveOperationOwner,
        diaryAutosaveOwnersEqual,
      },
    )
    return { calls, persist, lifecycleRef, detailsPersistTokenRef }
  }

  it('TEST 29 — stale Save Area must not publish the current photo baseline', async () => {
    const ownerA = lifecycleOwner('report-a', 1)
    const ownerB = lifecycleOwner('report-b', 2)
    const run = areaBaselineHarness(ownerA, ownerB)
    await run.finalize(run.result)
    assert.equal(run.baseline.current.marker, 'current-baseline')
    assert.deepEqual(run.calls, [])
    assert.equal(run.walkRef.current[0].areaName, 'Current area')
    assert.equal(run.draftPhotosRef.current[0].id, 'draft-current')
  })

  it('TEST 30 — same-report stale Save Area must not publish baseline', async () => {
    const ownerG1 = lifecycleOwner('report-a', 1)
    const ownerG2 = lifecycleOwner('report-a', 2)
    const run = areaBaselineHarness(ownerG1, ownerG2)
    await run.finalize(run.result)
    assert.equal(run.baseline.current.marker, 'current-baseline')
    assert.deepEqual(run.calls, [])
    assert.equal(run.walkRef.current[0].areaName, 'Current area')
  })

  it('TEST 31 — stale Project Details controller success cannot update the local editor', async () => {
    const ownerA = lifecycleOwner('report-a', 1)
    const ownerB = lifecycleOwner('report-b', 2)
    const run = controllerPersistHarness(ownerA, ownerB)
    await run.persist({ navigateAfterSuccess: false })
    assert.equal(run.calls.some((call) => call[0] === 'brandingId'), false)
    assert.equal(run.calls.some((call) => call[0] === 'brandColor'), false)
    assert.equal(run.calls.some((call) => call[0] === 'logoStoragePath'), false)
    assert.equal(run.calls.some((call) => call[0] === 'sync'), false)
  })

  it('TEST 32 — same-report reload suppresses old controller setters', async () => {
    const ownerG1 = lifecycleOwner('report-a', 1)
    const ownerG2 = lifecycleOwner('report-a', 2)
    const run = controllerPersistHarness(ownerG1, ownerG2)
    await run.persist({ navigateAfterSuccess: false })
    assert.equal(run.calls.some((call) => call[0] === 'brandingId'), false)
    assert.equal(run.calls.some((call) => call[0] === 'brandColor'), false)
    assert.equal(run.calls.some((call) => call[0] === 'logoStoragePath'), false)
    assert.equal(run.calls.some((call) => call[0] === 'sync'), false)
  })

  it('TEST 33 — stale Project Details failure cannot show the current editor error', async () => {
    const ownerA = lifecycleOwner('report-a', 1)
    const ownerB = lifecycleOwner('report-b', 2)
    const run = controllerPersistHarness(ownerA, ownerB, { fail: true, replaceToken: true })
    await run.persist({ navigateAfterSuccess: false })
    assert.equal(run.calls.some((call) => call[0] === 'error' && call[1]), false)
    assert.equal(run.calls.some((call) => call[0] === 'dates' && call[1]), false)
    assert.equal(run.calls.some((call) => call[0] === 'brandingId'), false)
    assert.equal(run.calls.some((call) => call[0] === 'saving' && call[1] === false), false)
    assert.equal(run.detailsPersistTokenRef.current?.newer, true)
  })

  it('TEST 34 — same-owner Save Area and Project Details completion still publish', async () => {
    const ownerA = lifecycleOwner('report-a', 1)
    const area = areaBaselineHarness(ownerA, null)
    await area.finalize(area.result)
    assert.equal(area.baseline.current.marker, 'a-baseline')
    assert.equal(area.calls.some((call) => call[0] === 'onChange'), true)
    assert.equal(area.calls.some((call) => Array.isArray(call) && call[1] === 'after_save'), true)

    const saved = controllerPersistHarness(ownerA, null)
    await saved.persist({ navigateAfterSuccess: false })
    assert.equal(saved.calls.some((call) => call[0] === 'brandingId' && call[1] === 'brand-a'), true)
    assert.equal(saved.calls.some((call) => call[0] === 'brandColor' && call[1] === '#111111'), true)
    assert.equal(saved.calls.some((call) => call[0] === 'logoStoragePath' && call[1] === 'logos/a.png'), true)
    assert.equal(saved.calls.some((call) => call[0] === 'sync'), true)

    const failed = controllerPersistHarness(ownerA, null, { fail: true })
    await failed.persist({ navigateAfterSuccess: false })
    assert.equal(
      failed.calls.some((call) => call[0] === 'error' && String(call[1]).includes('Could not save')),
      true,
    )
    assert.equal(failed.calls.some((call) => call[0] === 'dates'), true)
  })
})
