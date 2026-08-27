'use client'

/**
 * Location Walk = Photo Evidence workflow (named areas).
 * Active create → Save Area confirmation → Add Another / Continue to Signature.
 * Saved areas show their photographic record immediately; Edit opens the existing area.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'
import { CapturePhotoPreview } from '@/components/photo-workspace/CapturePhotoPreview'
import { CaptureThumbnailGrid } from '@/components/photo-workspace/CaptureThumbnailGrid'
import { PhotosPerPagePicker } from '@/components/ai-annotation/AreaPhotoViewer'
import {
  GlassSection,
  PrimaryCTA,
  SecondaryButton,
  EqualChoiceButton,
  inputStyle,
  labelStyle,
} from '@/lib/premium-ui'
import {
  collectRecentAreaNames,
  createAreaPhoto,
  firstIncompletePhoto,
  flattenAreaGroups,
  layoutToPerPage,
  moveItem,
  openSavedAreaForEdit,
  perPageToLayout,
} from '@/lib/ai-annotation/area-groups'
import { commitUnsavedPhotoAreaToWalk } from '@/lib/photo-workspace/commit-unsaved-area'
import {
  applyShadowPrepareToPhotos,
  collectShadowPrepareJobs,
  findPhotoShadowTarget,
  runShadowPrepareJobs,
  withShadowPreparePending,
} from '@/lib/photo-workspace/shadow-ingest'
import { normalizeRotationDegrees } from '@/lib/diary-pdf-layout'

/** @typedef {'create' | 'after_save' | 'review'} WalkPhase */

const fieldErrorStyle = {
  margin: '6px 0 0',
  fontSize: 13,
  color: '#ff6b6b',
  lineHeight: 1.35,
}

const primaryTap = {
  minHeight: 48,
  width: '100%',
}

/** Temporary existing-area strip heading — Add/Edit only; subordinate to the draft panel title. */
const savedAreaStripHeadingStyle = {
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '0.01em',
  textTransform: 'none',
  color: 'var(--text)',
  marginBottom: 6,
}

function SavedAreaCard({
  group,
  onEdit,
  onOpenPhoto,
  globalOffset,
  totalPhotoCount = 0,
}) {
  const perPage = layoutToPerPage(group.layout)

  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid var(--edge)',
        background: 'var(--plate)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
          padding: '12px 14px',
        }}
      >
        <div
          style={{
            flex: 1,
            textAlign: 'left',
            padding: '4px 0',
            color: 'inherit',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
            {group.areaName}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 3 }}>
            {group.photos.length} photo{group.photos.length === 1 ? '' : 's'} · {perPage} per page
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <SecondaryButton type="button" onClick={onEdit}>Edit</SecondaryButton>
        </div>
      </div>

      <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--edge)' }}>
          {group.description ? (
            <p
              style={{
                margin: '12px 0 0',
                color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
                fontSize: 13,
                lineHeight: 1.45,
                overflowWrap: 'anywhere',
              }}
            >
              {group.description}
            </p>
          ) : null}

          <CaptureThumbnailGrid
            photos={group.photos}
            numberOffset={globalOffset}
            totalPhotoCount={totalPhotoCount}
            onOpen={onOpenPhoto}
            readOnly
            perPage={perPage}
          />

      </div>
    </div>
  )
}

export const AiLocationWalk = forwardRef(function AiLocationWalk({
  accent,
  value = [],
  onChange,
  title = 'Photo Evidence',
  onContinueToSignature,
  onAreaSaved,
  /** Optional Photo Workspace labels (P2A). Falls back to diary-friendly defaults. */
  labels = null,
  /** Phase D: resolve canonical report signed URL when the full viewer opens. */
  ensureReportPreview = null,
  /** Clears diary page missing-name Share error when Area name becomes valid. */
  onAreaNameValidationResolved = null,
}, ref) {
  const copy = {
    sectionIntro: '',
    addGroup: 'Add Work Area',
    createGroup: 'Add Work Area',
    groupNameLabel: 'Area name',
    groupNamePlaceholder: 'e.g. Ground Floor Reception',
    groupDescriptionLabel: 'Notes for this area',
    groupDescriptionPlaceholder: 'Work carried out, materials used, or other site notes',
    saveGroup: 'Save Area',
    areaSavedTitle: '✓ Area saved.',
    areaSavedHint: 'Add another area or continue your report.',
    addAnother: 'Add Another Area',
    continueReport: 'Continue',
    enterNameError: 'Enter a work area name',
    cancelGroup: 'Cancel',
    ...(labels || {}),
  }
  const sectionTitle = title || copy.sectionTitle || 'Photo Evidence'

  const locationWalk = useMemo(() => (Array.isArray(value) ? value : []), [value])
  const walkRef = useRef(locationWalk)
  useEffect(() => { walkRef.current = locationWalk }, [locationWalk])

  const [phase, setPhase] = useState(() => (locationWalk.length ? 'review' : 'create'))
  const [nameDraft, setNameDraft] = useState('')
  const [descriptionDraft, setDescriptionDraft] = useState('')
  const [perPageDraft, setPerPageDraft] = useState(4)
  const [editingGroupId, setEditingGroupId] = useState(null)
  /** Photos for a brand-new area — not in locationWalk until Save Area */
  const [draftPhotos, setDraftPhotos] = useState([])
  const [nameError, setNameError] = useState('')
  const [layoutError, setLayoutError] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [capturing, setCapturing] = useState(false)
  const [persistingArea, setPersistingArea] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [viewer, setViewer] = useState(null)
  const [walkError, setWalkError] = useState('')
  const sectionRef = useRef(null)
  const editorRef = useRef(null)
  const nameInputRef = useRef(null)
  const areaNameErrorId = useId()
  /** Synchronous Save Area lock — blocks double-tap before React re-renders. */
  const persistingAreaRef = useRef(false)
  /** Phase B: photo ids already handed to shadow prepare (dedupe Strict Mode / re-select). */
  const shadowStartedIdsRef = useRef(new Set())
  /** Latest draft list for late shadow results after Save Area may have cleared state. */
  const draftPhotosRef = useRef(draftPhotos)
  draftPhotosRef.current = draftPhotos

  // Suggestions come from this diary's own saved areas only. A previous diary must
  // never seed the Work Area Name field or its shortcuts.
  const recentAreas = useMemo(
    () => collectRecentAreaNames(locationWalk),
    [locationWalk],
  )

  const editingGroup = useMemo(
    () => locationWalk.find((g) => g.id === editingGroupId) || null,
    [locationWalk, editingGroupId],
  )
  const editingGroupIndex = useMemo(
    () => locationWalk.findIndex((g) => g.id === editingGroupId),
    [locationWalk, editingGroupId],
  )

  const activePhotos = editingGroup ? editingGroup.photos : draftPhotos
  const isEditing = Boolean(editingGroupId)
  const visibleSavedGroups = useMemo(
    () => locationWalk.filter((group) => !(isEditing && group.id === editingGroupId)),
    [locationWalk, isEditing, editingGroupId],
  )

  const updateWalk = useCallback((updater) => {
    const prev = walkRef.current
    const next = typeof updater === 'function' ? updater(prev) : updater
    walkRef.current = next
    onChange(next)
  }, [onChange])

  /**
   * Phase B: attach shadowPrepare by stable photo id.
   * Prefer committed locationWalk over draft so late results follow Save Area
   * even if draft has not cleared yet. Deleted photos are ignored (no recreate).
   */
  const applyShadowPrepareResult = useCallback((photoId, shadowPrepare) => {
    const walkTarget = findPhotoShadowTarget(photoId, {
      draftPhotos: [],
      locationWalk: walkRef.current,
    })
    if (walkTarget?.container === 'group') {
      updateWalk((prev) => prev.map((group) => {
        if (!group || String(group.id) !== String(walkTarget.groupId)) return group
        return {
          ...group,
          photos: applyShadowPrepareToPhotos(group.photos || [], photoId, shadowPrepare),
        }
      }))
      return
    }
    const draftTarget = findPhotoShadowTarget(photoId, {
      draftPhotos: draftPhotosRef.current,
      locationWalk: [],
    })
    if (!draftTarget) return
    setDraftPhotos((prev) => applyShadowPrepareToPhotos(prev, photoId, shadowPrepare))
  }, [updateWalk])

  const clearFieldErrors = () => {
    setNameError('')
    setLayoutError('')
    setPhotoError('')
  }

  const notifyAreaNameValid = useCallback(() => {
    onAreaNameValidationResolved?.()
  }, [onAreaNameValidationResolved])

  const focusAreaNameField = useCallback(() => {
    requestAnimationFrame(() => {
      nameInputRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      nameInputRef.current?.focus?.({ preventScroll: true })
    })
  }, [])

  const handleAreaNameChange = useCallback((nextValue) => {
    setNameDraft(nextValue)
    if (String(nextValue || '').trim()) {
      setNameError('')
      notifyAreaNameValid()
    }
  }, [notifyAreaNameValid])

  const beginCreate = useCallback(() => {
    setNameDraft('')
    setDescriptionDraft('')
    // Retain most recent photos-per-page setting
    setEditingGroupId(null)
    setDraftPhotos([])
    clearFieldErrors()
    setPhase('create')
  }, [])

  const validateSave = () => {
    let ok = true
    const name = nameDraft.trim()
    if (!name) {
      setNameError(copy.enterNameError)
      ok = false
    } else {
      setNameError('')
    }
    if (![1, 4, 6].includes(Number(perPageDraft))) {
      setLayoutError('Choose a photo layout')
      ok = false
    } else {
      setLayoutError('')
    }
    const photos = isEditing ? (editingGroup?.photos || []) : draftPhotos
    if (!photos.length) {
      setPhotoError('Add at least one photo')
      ok = false
    } else {
      setPhotoError('')
    }
    return ok
  }

  const handleFiles = async (files, groupId = null) => {
    const list = Array.from(files || []).filter((f) => f instanceof Blob)
    if (!list.length) return
    // Stay on the current Work Area — append thumbnails in place (no navigation / reload).
    setCapturing(true)
    setPhotoError('')
    const nextPhotos = []
    for (const file of list) {
      const preview = URL.createObjectURL(file)
      // Live production fields unchanged — shadowPrepare is transient Phase B only.
      nextPhotos.push(withShadowPreparePending({
        ...createAreaPhoto({ file, preview, description: '', rotationDegrees: 0 }),
        uploadState: 'local_only',
        saveState: 'unsaved',
      }))
    }

    const targetId = (groupId || isEditing) ? (groupId || editingGroupId) : '__draft__'
    if (groupId || isEditing) {
      updateWalk((prev) => prev.map((g) => (
        g.id === targetId ? { ...g, photos: [...g.photos, ...nextPhotos] } : g
      )))
    } else {
      setDraftPhotos((prev) => [...prev, ...nextPhotos])
    }
    // Immediate local preview is already on screen — do not await pipeline.
    setCapturing(false)

    // Phase B shadow ingest: prepare report+thumb in memory only. Never replaces
    // file/preview/imageUrl or touches upload/PDF paths.
    const jobs = collectShadowPrepareJobs(nextPhotos, shadowStartedIdsRef.current)
    if (jobs.length) {
      void runShadowPrepareJobs(jobs, {
        onResult: (photoId, shadowPrepare) => {
          // Resolve by photo id at completion time — not the selection-time container.
          applyShadowPrepareResult(photoId, shadowPrepare)
        },
      })
    }
  }

  const applyCommittedArea = useCallback((result) => {
    if (!result?.ok || !result.committed || !result.saved) return false
    if (result.clearedDraft) setDraftPhotos([])
    setLastSaved({
      name: result.saved.areaName,
      count: (result.saved.photos || []).length,
      perPage: layoutToPerPage(result.saved.layout),
    })
    setEditingGroupId(null)
    setDescriptionDraft('')
    clearFieldErrors()
    setPhase('after_save')
    return true
  }, [])

  const releasePersistingBusy = useCallback(() => {
    persistingAreaRef.current = false
    setPersistingArea(false)
  }, [])

  /** Yield one frame so “Saving area…” can paint before prepare/upload work. */
  const yieldForSaveAreaPaint = () => {
    if (typeof requestAnimationFrame === 'function') {
      return new Promise((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    }
    return Promise.resolve()
  }

  const persistCommittedArea = useCallback(async (result) => {
    if (!result?.ok || !result.committed || !result.saved) {
      return { ok: false, reason: 'not-committed' }
    }
    let walkToCommit = result.locationWalk
    if (onAreaSaved) {
      const persistResult = await onAreaSaved(result.saved, {
        locationWalk: result.locationWalk,
      })
      if (persistResult && persistResult.ok === false) {
        setPhotoError(
          persistResult.message
            || 'We couldn’t save this photo area yet. Check your connection and tap Save Area again.',
        )
        return { ok: false, reason: persistResult.reason || 'persist-failed' }
      }
      if (persistResult?.locationWalk) {
        walkToCommit = persistResult.locationWalk
      }
    }
    walkRef.current = walkToCommit
    onChange(walkToCommit)
    const saved = walkToCommit.find((g) => g.id === result.saved.id) || result.saved
    return { ok: true, locationWalk: walkToCommit, saved, clearedDraft: result.clearedDraft }
  }, [onAreaSaved, onChange])

  const finalizeAreaSave = useCallback(async (result) => {
    const persisted = await persistCommittedArea(result)
    if (!persisted.ok) return false
    return applyCommittedArea({ ...result, ...persisted })
  }, [applyCommittedArea, persistCommittedArea])

  const buildCommitInput = useCallback(() => ({
    phase,
    locationWalk: walkRef.current,
    draftPhotos,
    nameDraft,
    descriptionDraft,
    perPageDraft,
    editingGroupId,
    editingGroupPhotos: editingGroup?.photos || null,
  }), [
    phase,
    draftPhotos,
    nameDraft,
    descriptionDraft,
    perPageDraft,
    editingGroupId,
    editingGroup,
  ])

  const saveArea = async () => {
    if (persistingAreaRef.current) return
    if (!validateSave()) {
      if (!nameDraft.trim()) {
        focusAreaNameField()
      }
      return
    }

    persistingAreaRef.current = true
    setPersistingArea(true)
    try {
      await yieldForSaveAreaPaint()
      const result = commitUnsavedPhotoAreaToWalk(buildCommitInput())
      if (!result.ok) {
        if (result.reason === 'missing-name') setNameError(copy.enterNameError)
        if (result.reason === 'missing-layout') setLayoutError('Choose a photo layout')
        if (result.reason === 'missing-photos') setPhotoError('Add at least one photo')
        return
      }
      if (result.committed) {
        await finalizeAreaSave(result)
      }
    } finally {
      releasePersistingBusy()
    }
  }

  /**
   * Save & Share entry: commit the current unsaved area with the same Save Area
   * logic, or block when the draft is incomplete. Returns the walk Share must use.
   */
  const commitUnsavedAreaForShare = useCallback(async () => {
    const result = commitUnsavedPhotoAreaToWalk(buildCommitInput())
    if (!result.ok) {
      if (result.reason === 'missing-name') setNameError(copy.enterNameError)
      if (result.reason === 'missing-layout') setLayoutError('Choose a photo layout')
      if (result.reason === 'missing-photos') setPhotoError('Add at least one photo')
      setPhase('create')
      return result
    }
    if (result.committed) {
      const persisted = await persistCommittedArea(result)
      if (!persisted.ok) {
        return { ...result, ok: false, blocked: true, reason: persisted.reason || 'persist-failed' }
      }
      return {
        ...result,
        locationWalk: persisted.locationWalk,
      }
    }
    return result
  }, [buildCommitInput, copy.enterNameError, persistCommittedArea])

  const editGroup = (groupId) => {
    // Prefer walkRef so Edit resolves against the latest hydrated groups
    // (progressive sign can replace value between tap and handler).
    const opened = openSavedAreaForEdit(walkRef.current, groupId)
      || openSavedAreaForEdit(locationWalk, groupId)
    if (!opened) return
    setEditingGroupId(opened.groupId)
    setNameDraft(opened.nameDraft)
    setDescriptionDraft(opened.descriptionDraft)
    setPerPageDraft(opened.perPageDraft)
    setDraftPhotos([])
    clearFieldErrors()
    setPhase('create')
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    })
  }

  // Warn before leave/refresh when create-flow has unsaved local work (online-first; no IndexedDB).
  useEffect(() => {
    const dirty =
      phase === 'create'
      && (
        Boolean(nameDraft.trim())
        || Boolean(descriptionDraft.trim())
        || draftPhotos.length > 0
      )
    if (!dirty) return undefined
    const onBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [phase, nameDraft, descriptionDraft, draftPhotos.length])

  const openViewer = (groupId, index) => {
    setWalkError('')
    setViewer({
      groupId,
      index,
      scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
    })
  }

  const openFirstIncompletePhoto = useCallback(() => {
    const target = firstIncompletePhoto(walkRef.current)
    if (!target) return false
    openViewer(target.groupId, target.index)
    requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    })
    return true
  }, [])

  useImperativeHandle(ref, () => ({
    openFirstIncompletePhoto,
    commitUnsavedAreaForShare,
  }), [openFirstIncompletePhoto, commitUnsavedAreaForShare])

  const closeViewer = () => {
    const scrollY = viewer?.scrollY || 0
    setViewer(null)
    requestAnimationFrame(() => {
      if (typeof window !== 'undefined') window.scrollTo(0, scrollY)
    })
  }

  const patchPhoto = (groupId, photoId, patch) => {
    if (groupId === '__draft__') {
      setDraftPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, ...patch } : p)))
      return
    }
    updateWalk((prev) => prev.map((g) => {
      if (g.id !== groupId) return g
      return {
        ...g,
        photos: g.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)),
      }
    }))
  }

  const rotatePhoto = (groupId, photoId) => {
    const bump = (photo) => ({
      ...photo,
      rotationDegrees: normalizeRotationDegrees((Number(photo.rotationDegrees) || 0) + 90),
    })
    if (groupId === '__draft__') {
      setDraftPhotos((prev) => prev.map((p) => (p.id === photoId ? bump(p) : p)))
      return
    }
    updateWalk((prev) => prev.map((g) => {
      if (g.id !== groupId) return g
      return {
        ...g,
        photos: g.photos.map((p) => (p.id === photoId ? bump(p) : p)),
      }
    }))
  }

  const removePhoto = (groupId, photoId) => {
    const revoke = (target) => {
      if (target?.file && target.preview) {
        try { URL.revokeObjectURL(target.preview) } catch { /* ignore */ }
      }
    }
    if (groupId === '__draft__') {
      setDraftPhotos((prev) => {
        const target = prev.find((p) => p.id === photoId)
        revoke(target)
        const next = prev.filter((p) => p.id !== photoId)
        if (viewer?.groupId === '__draft__') {
          if (!next.length) {
            queueMicrotask(() => setViewer(null))
          } else {
            setViewer((v) => v && ({ ...v, index: Math.min(v.index, next.length - 1) }))
          }
        }
        return next
      })
      return
    }
    updateWalk((prev) => prev.map((g) => {
      if (g.id !== groupId) return g
      const target = g.photos.find((p) => p.id === photoId)
      revoke(target)
      return { ...g, photos: g.photos.filter((p) => p.id !== photoId) }
    }))
    if (viewer?.groupId === groupId) {
      const g = walkRef.current.find((x) => x.id === groupId)
      if (!g?.photos?.length) closeViewer()
      else setViewer((v) => v && ({ ...v, index: Math.min(v.index, g.photos.length - 1) }))
    }
  }

  const viewerGroup = viewer?.groupId === '__draft__'
    ? { id: '__draft__', areaName: nameDraft.trim() || 'New area', photos: draftPhotos }
    : (viewer ? locationWalk.find((g) => g.id === viewer.groupId) : null)

  const globalNumbersForGroup = (groupId) => {
    if (groupId === '__draft__') {
      const base = flattenAreaGroups(locationWalk).length
      return draftPhotos.map((_, i) => base + i + 1)
    }
    const rows = flattenAreaGroups(locationWalk)
    return rows.filter((r) => r.areaId === groupId).map((r) => r.sequence)
  }

  const areaOffset = (groupId) => {
    let offset = 0
    for (const g of locationWalk) {
      if (g.id === groupId) return offset
      offset += g.photos.length
    }
    return offset
  }

  const draftPhotoOffset = flattenAreaGroups(locationWalk).length

  const continueToSignature = () => {
    if (!locationWalk.length) return
    setWalkError('')
    // Close the Location Walk action stage — do not require another Save Area.
    setPhase('handed_off')
    onContinueToSignature?.()
  }

  const recentAreaReferenceStrip = (phase === 'create' && recentAreas.length > 0) ? (
    <div data-recent-area-reference-strip="true" style={{ marginBottom: 16 }}>
      <div
        data-saved-photo-areas-heading="true"
        style={savedAreaStripHeadingStyle}
      >
        Photo areas recorded so far
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {recentAreas.map((name) => (
          <SecondaryButton
            key={name}
            type="button"
            onClick={() => {
              handleAreaNameChange(name)
            }}
          >
            {name}
          </SecondaryButton>
        ))}
      </div>
    </div>
  ) : null

  return (
    <GlassSection title={sectionTitle} accent={accent}>
      {copy.sectionIntro ? (
        <p
          style={{
            margin: '0 0 14px',
            fontSize: 14,
            lineHeight: 1.45,
            color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
          }}
        >
          {copy.sectionIntro}
        </p>
      ) : null}
      <div ref={sectionRef}>
      {walkError ? (
        <p style={{ ...fieldErrorStyle, marginBottom: 12 }}>{walkError}</p>
      ) : null}

      {capturing ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--edge)',
            background: 'var(--plate)',
            color: 'var(--text)',
            fontSize: 14,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              border: '2px solid rgba(255,255,255,0.25)',
              borderTopColor: 'var(--action, #FF5000)',
              animation: 'zlog-spin 0.8s linear infinite',
            }}
          />
          Preparing photo…
          <style>{`@keyframes zlog-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : null}

      {isEditing ? recentAreaReferenceStrip : null}

      {/* While editing a saved area, open the composer first and hide that card. */}
      {phase === 'create' && isEditing ? (
        <div ref={editorRef} data-area-editor="saved">
          <div style={{ ...labelStyle, marginBottom: 8 }}>Area name</div>
          <input
            ref={nameInputRef}
            type="text"
            value={nameDraft}
            onChange={(e) => handleAreaNameChange(e.target.value)}
            placeholder={copy.groupNamePlaceholder}
            style={{ ...inputStyle, marginBottom: nameError ? 0 : 14, minHeight: 48 }}
            autoComplete="off"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? areaNameErrorId : undefined}
          />
          {nameError ? (
            <p id={areaNameErrorId} style={{ ...fieldErrorStyle, marginBottom: 12 }}>{nameError}</p>
          ) : null}

          <div style={{ ...labelStyle, marginBottom: 8 }}>Photos per page</div>
          <PhotosPerPagePicker
            layout={perPageToLayout(perPageDraft)}
            onChange={(n) => {
              setPerPageDraft(n)
              setLayoutError('')
            }}
            disabled={capturing}
          />
          {layoutError ? <p style={fieldErrorStyle}>{layoutError}</p> : null}

          <div style={{ marginTop: 16 }}>
            <ImageSourceButtons
              onFiles={(files) => handleFiles(files, null)}
              multiple
              disabled={capturing}
              stacked
              cameraLabel="Take Photo"
              galleryLabel="Upload 1 or More Photos"
            />
          </div>

          {activePhotos.length > 0 ? (
            <CaptureThumbnailGrid
              photos={activePhotos}
              numberOffset={areaOffset(editingGroupId)}
              onOpen={(pi) => openViewer(editingGroupId, pi)}
              onDelete={(photoId) => removePhoto(editingGroupId, photoId)}
              onRotate={(photoId) => rotatePhoto(editingGroupId, photoId)}
              onCaptionChange={(photoId, text) =>
                patchPhoto(editingGroupId, photoId, {
                  acceptedDescription: text,
                })
              }
              onAssignedToChange={(photoId, text) =>
                patchPhoto(editingGroupId, photoId, {
                  assignedTo: text,
                })
              }
            />
          ) : null}
          {photoError ? <p style={fieldErrorStyle}>{photoError}</p> : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            <SecondaryButton
              type="button"
              disabled={editingGroupIndex <= 0}
              onClick={() => updateWalk((prev) => moveItem(prev, editingGroupIndex, editingGroupIndex - 1))}
            >
              Move area up
            </SecondaryButton>
            <SecondaryButton
              type="button"
              disabled={editingGroupIndex < 0 || editingGroupIndex >= locationWalk.length - 1}
              onClick={() => updateWalk((prev) => moveItem(prev, editingGroupIndex, editingGroupIndex + 1))}
            >
              Move area down
            </SecondaryButton>
            <SecondaryButton
              type="button"
              onClick={() => {
                updateWalk((prev) => prev.filter((g) => g.id !== editingGroupId))
                setEditingGroupId(null)
                setNameDraft('')
                setDescriptionDraft('')
                setDraftPhotos([])
                clearFieldErrors()
                setPhase('review')
              }}
            >
              Delete area
            </SecondaryButton>
          </div>

          <div style={{ marginTop: 18 }}>
            <PrimaryCTA
              type="button"
              surface="workbench"
              accent={accent}
              disabled={capturing || persistingArea}
              onClick={saveArea}
              style={primaryTap}
            >
              {persistingArea ? 'Saving area…' : copy.saveGroup}
            </PrimaryCTA>
          </div>

          <div style={{ marginTop: 10, marginBottom: 16 }}>
            <SecondaryButton
              type="button"
              onClick={() => {
                setEditingGroupId(null)
                setDraftPhotos([])
                setDescriptionDraft('')
                clearFieldErrors()
                setPhase('review')
              }}
            >
              {copy.cancelGroup}
            </SecondaryButton>
          </div>
        </div>
      ) : null}

      {/* Saved areas always visible — never hide stored data behind confirmation */}
      {locationWalk.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {visibleSavedGroups.map((group) => (
            <SavedAreaCard
              key={group.id}
              group={group}
              globalOffset={areaOffset(group.id)}
              totalPhotoCount={flattenAreaGroups(locationWalk).length}
              onEdit={() => editGroup(group.id)}
              onOpenPhoto={(pi) => openViewer(group.id, pi)}
            />
          ))}
        </div>
      )}

      {!isEditing ? recentAreaReferenceStrip : null}

      {phase === 'create' && !isEditing && (
        <div
          ref={editorRef}
          data-area-editor="new"
          data-new-photo-area="draft"
          style={{
            marginTop: locationWalk.length > 0 ? 18 : 0,
            padding: '14px 14px 16px',
            borderRadius: 14,
            border: '1px solid color-mix(in srgb, var(--action, #FF5000) 42%, var(--edge))',
            background: 'color-mix(in srgb, var(--plate) 92%, var(--action, #FF5000) 8%)',
            boxShadow: 'inset 0 3px 0 var(--action, #FF5000)',
          }}
        >
          <div
            data-new-photo-area-heading="true"
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: 'var(--text)',
              marginBottom: 12,
              letterSpacing: '-0.01em',
            }}
          >
            New Photo Area
          </div>
          <div style={{ ...labelStyle, marginBottom: 8 }}>Area name</div>
          <input
            ref={nameInputRef}
            type="text"
            value={nameDraft}
            onChange={(e) => handleAreaNameChange(e.target.value)}
            placeholder={copy.groupNamePlaceholder}
            style={{ ...inputStyle, marginBottom: nameError ? 0 : 14, minHeight: 48 }}
            autoComplete="off"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? areaNameErrorId : undefined}
          />
          {nameError ? (
            <p id={areaNameErrorId} style={{ ...fieldErrorStyle, marginBottom: 12 }}>{nameError}</p>
          ) : null}

          <div style={{ ...labelStyle, marginBottom: 8 }}>Photos per page</div>
          <PhotosPerPagePicker
            layout={perPageToLayout(perPageDraft)}
            onChange={(n) => {
              setPerPageDraft(n)
              setLayoutError('')
            }}
            disabled={capturing}
          />
          {layoutError ? <p style={fieldErrorStyle}>{layoutError}</p> : null}

          <div style={{ marginTop: 16 }}>
            <ImageSourceButtons
              onFiles={(files) => handleFiles(files, null)}
              multiple
              disabled={capturing}
              stacked
              cameraLabel="Take Photo"
              galleryLabel="Upload 1 or More Photos"
            />
          </div>

          {activePhotos.length > 0 ? (
            <CaptureThumbnailGrid
              photos={activePhotos}
              numberOffset={draftPhotoOffset}
              onOpen={(pi) => openViewer('__draft__', pi)}
              onDelete={(photoId) => removePhoto('__draft__', photoId)}
              onRotate={(photoId) => rotatePhoto('__draft__', photoId)}
              onCaptionChange={(photoId, text) =>
                patchPhoto('__draft__', photoId, {
                  acceptedDescription: text,
                })
              }
              onAssignedToChange={(photoId, text) =>
                patchPhoto('__draft__', photoId, {
                  assignedTo: text,
                })
              }
            />
          ) : null}
          {photoError ? <p style={fieldErrorStyle}>{photoError}</p> : null}

          <div style={{ marginTop: 18 }}>
            <PrimaryCTA
              type="button"
              surface="workbench"
              accent={accent}
              disabled={capturing || persistingArea}
              onClick={saveArea}
              style={primaryTap}
            >
              {persistingArea ? 'Saving area…' : copy.saveGroup}
            </PrimaryCTA>
          </div>

          {locationWalk.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <SecondaryButton
                type="button"
                onClick={() => {
                  setEditingGroupId(null)
                  setDraftPhotos([])
                  setDescriptionDraft('')
                  clearFieldErrors()
                  setPhase('review')
                }}
              >
                {copy.cancelGroup}
              </SecondaryButton>
            </div>
          )}
        </div>
      )}

      {phase === 'after_save' && lastSaved && (
        <div
          style={{
            padding: '16px 14px',
            borderRadius: 12,
            border: '1px solid var(--edge)',
            background: 'var(--plate)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>
            {copy.areaSavedTitle}
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.45, color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))' }}>
            {copy.areaSavedHint}
          </p>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            {lastSaved.name}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 2 }}>
            {lastSaved.count} photo{lastSaved.count === 1 ? '' : 's'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 18 }}>
            {lastSaved.perPage} per page
          </div>
          <EqualChoiceButton type="button" onClick={beginCreate} style={primaryTap}>
            {copy.addAnother}
          </EqualChoiceButton>
        </div>
      )}

      {phase === 'review' && (
        <div>
          {locationWalk.length === 0 ? (
            <PrimaryCTA type="button" surface="workbench" accent={accent} onClick={beginCreate} style={primaryTap}>
              {copy.createGroup}
            </PrimaryCTA>
          ) : (
            <div style={{ marginTop: 4 }}>
              <EqualChoiceButton type="button" onClick={beginCreate} style={primaryTap}>
                {copy.addAnother}
              </EqualChoiceButton>
            </div>
          )}
        </div>
      )}

      {phase === 'handed_off' && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '14px 14px',
            borderRadius: 12,
            border: '1px solid var(--edge)',
            background: 'var(--plate)',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
            Location Walk complete
          </div>
          <p
            style={{
              margin: '0 0 12px',
              fontSize: 14,
              lineHeight: 1.45,
              color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
            }}
          >
            Continue with your signature below. You can still add another area if needed.
          </p>
          <SecondaryButton type="button" onClick={beginCreate} style={primaryTap}>
            {copy.addAnother}
          </SecondaryButton>
        </div>
      )}

      {viewer && viewerGroup && (
        <CapturePhotoPreview
          key={viewer.groupId}
          photos={viewerGroup.photos}
          startIndex={viewer.index}
          areaName={viewerGroup.areaName}
          globalNumbers={globalNumbersForGroup(viewer.groupId)}
          accent={accent}
          onClose={closeViewer}
          onCaptionChange={(photoId, text) => patchPhoto(viewer.groupId, photoId, { acceptedDescription: text })}
          onRotate={(photoId) => rotatePhoto(viewer.groupId, photoId)}
          onDelete={(photoId) => removePhoto(viewer.groupId, photoId)}
          ensureReportPreview={ensureReportPreview}
        />
      )}
      </div>
    </GlassSection>
  )
})
