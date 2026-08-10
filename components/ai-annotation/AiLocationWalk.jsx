'use client'

/**
 * Location Walk = Photo Evidence workflow (named areas).
 * Active create → Save Area confirmation → Add Another / Continue to Signature.
 * Saved areas stay visible as expandable cards.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'
import { CapturePhotoPreview } from '@/components/photo-workspace/CapturePhotoPreview'
import { CaptureThumbnailGrid } from '@/components/photo-workspace/CaptureThumbnailGrid'
import { PhotosPerPagePicker } from '@/components/ai-annotation/AreaPhotoViewer'
import { useSpeechDictation } from '@/components/ai-annotation/useSpeechDictation'
import {
  GlassSection,
  PrimaryCTA,
  SecondaryButton,
  inputStyle,
  labelStyle,
} from '@/lib/premium-ui'
import {
  collectRecentAreaNames,
  createAreaGroup,
  createAreaPhoto,
  firstIncompletePhoto,
  flattenAreaGroups,
  layoutToPerPage,
  moveItem,
  perPageToLayout,
  photosMissingDescription,
  readRecentAreas,
  rememberRecentArea,
} from '@/lib/ai-annotation/area-groups'

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

function SavedAreaCard({
  group,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onOpenPhoto,
  onRename,
  onLayoutChange,
  onAddPhotos,
  onRemovePhoto,
  onRotatePhoto,
  globalOffset,
  isFirst,
  isLast,
  accent,
  capturing,
}) {
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState(group.areaName)
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
        <button
          type="button"
          onClick={onToggle}
          style={{
            flex: 1,
            textAlign: 'left',
            border: 'none',
            background: 'transparent',
            padding: '4px 0',
            minHeight: 48,
            cursor: 'pointer',
            color: 'inherit',
            fontFamily: 'inherit',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
            {group.areaName}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 3 }}>
            {group.photos.length} photo{group.photos.length === 1 ? '' : 's'} · {perPage} per page
          </div>
        </button>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <SecondaryButton type="button" onClick={onEdit}>Edit</SecondaryButton>
          <SecondaryButton type="button" onClick={onToggle}>
            {expanded ? 'Collapse' : 'Expand'}
          </SecondaryButton>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--edge)' }}>
          {renaming ? (
            <div style={{ marginTop: 12 }}>
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                style={{ ...inputStyle, marginBottom: 8, minHeight: 48 }}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <PrimaryCTA
                  type="button"
                  accent={accent}
                  onClick={() => {
                    onRename(nameDraft.trim())
                    setRenaming(false)
                  }}
                >
                  Save name
                </PrimaryCTA>
                <SecondaryButton type="button" onClick={() => { setNameDraft(group.areaName); setRenaming(false) }}>
                  Cancel
                </SecondaryButton>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <SecondaryButton type="button" onClick={() => setRenaming(true)}>Rename</SecondaryButton>
              <SecondaryButton type="button" disabled={isFirst} onClick={onMoveUp}>Move area up</SecondaryButton>
              <SecondaryButton type="button" disabled={isLast} onClick={onMoveDown}>Move area down</SecondaryButton>
              <SecondaryButton type="button" onClick={onDelete}>Delete area</SecondaryButton>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <div style={{ ...labelStyle, marginBottom: 8 }}>Photos per page</div>
            <PhotosPerPagePicker layout={group.layout} onChange={onLayoutChange} />
          </div>

          <div style={{ marginTop: 14 }}>
            <ImageSourceButtons
              onFiles={onAddPhotos}
              multiple
              disabled={capturing}
              stacked
              cameraLabel="Take Photo"
              galleryLabel="Add Multiple Photos"
            />
          </div>

          <CaptureThumbnailGrid
            photos={group.photos}
            numberOffset={globalOffset}
            onOpen={onOpenPhoto}
            onDelete={onRemovePhoto}
            onRotate={onRotatePhoto}
          />
        </div>
      )}
    </div>
  )
}

export const AiLocationWalk = forwardRef(function AiLocationWalk({
  accent,
  projectId,
  value = [],
  onChange,
  title = 'Photo Evidence',
  onContinueToSignature,
  onAreaSaved,
  /** Optional Photo Workspace labels (P2A). Falls back to diary-friendly defaults. */
  labels = null,
}, ref) {
  const copy = {
    sectionIntro: '',
    addGroup: 'Add Work Area',
    createGroup: 'Add Work Area',
    groupNameLabel: 'Work area name',
    groupNamePlaceholder: 'e.g. Ground Floor Reception',
    groupDescriptionLabel: 'Notes for this area',
    groupDescriptionPlaceholder: 'Work carried out, materials used, or other site notes',
    saveGroup: 'Save Area',
    areaSavedTitle: '✓ Area saved.',
    areaSavedHint: 'Add another area or continue your report.',
    addAnother: 'Add Another Area',
    continueReport: 'No More Areas — Continue',
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
  const [lastSaved, setLastSaved] = useState(null)
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const [viewer, setViewer] = useState(null)
  const [walkError, setWalkError] = useState('')
  const sectionRef = useRef(null)
  const [storedRecent, setStoredRecent] = useState(() => (
    projectId ? readRecentAreas(projectId) : []
  ))

  const recentAreas = useMemo(
    () => collectRecentAreaNames(locationWalk, storedRecent),
    [locationWalk, storedRecent],
  )

  const editingGroup = useMemo(
    () => locationWalk.find((g) => g.id === editingGroupId) || null,
    [locationWalk, editingGroupId],
  )

  const activePhotos = editingGroup ? editingGroup.photos : draftPhotos
  const isEditing = Boolean(editingGroupId)

  const updateWalk = useCallback((updater) => {
    const prev = walkRef.current
    const next = typeof updater === 'function' ? updater(prev) : updater
    walkRef.current = next
    onChange(next)
  }, [onChange])

  const rememberArea = useCallback((name) => {
    if (!projectId || !name) return
    rememberRecentArea(projectId, name)
    setStoredRecent(readRecentAreas(projectId))
  }, [projectId])

  const applyDictation = useCallback((text) => {
    if (text) {
      setNameDraft(text)
      setNameError('')
    }
  }, [])
  const { start: startDictation, listening, supported: dictationSupported } = useSpeechDictation(applyDictation)

  const clearFieldErrors = () => {
    setNameError('')
    setLayoutError('')
    setPhotoError('')
  }

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
      nextPhotos.push({
        ...createAreaPhoto({ file, preview, description: '', rotationDegrees: 0 }),
        uploadState: 'local_only',
        saveState: 'unsaved',
      })
    }

    if (groupId || isEditing) {
      const targetId = groupId || editingGroupId
      updateWalk((prev) => prev.map((g) => (
        g.id === targetId ? { ...g, photos: [...g.photos, ...nextPhotos] } : g
      )))
    } else {
      setDraftPhotos((prev) => [...prev, ...nextPhotos])
    }
    setCapturing(false)
  }

  const saveArea = () => {
    if (!validateSave()) return
    const name = nameDraft.trim()
    const description = descriptionDraft.trim()
    const layout = perPageToLayout(perPageDraft)

    const withGroupSaveState = (photos) => (photos || []).map((photo) => ({
      ...photo,
      saveState: 'linked_to_group',
    }))

    let saved
    if (isEditing && editingGroupId) {
      updateWalk((prev) => prev.map((g) => (
        g.id === editingGroupId
          ? {
              ...g,
              areaName: name,
              description,
              layout,
              completionState: 'saved',
              photos: withGroupSaveState(g.photos),
            }
          : g
      )))
      saved = walkRef.current.find((g) => g.id === editingGroupId)
    } else {
      const group = {
        ...createAreaGroup(name, perPageDraft),
        layout,
        description,
        completionState: 'saved',
        photos: withGroupSaveState(draftPhotos),
      }
      updateWalk((prev) => [...prev, group])
      saved = group
      setDraftPhotos([])
    }

    if (!saved) return

    rememberArea(name)
    setLastSaved({
      name: saved.areaName,
      count: (saved.photos || []).length,
      perPage: layoutToPerPage(saved.layout),
    })
    setExpandedIds((prev) => new Set([...prev, saved.id]))
    setEditingGroupId(null)
    setDescriptionDraft('')
    clearFieldErrors()
    setPhase('after_save')
    onAreaSaved?.(saved)
  }

  const editGroup = (groupId) => {
    const group = locationWalk.find((g) => g.id === groupId)
    if (!group) return
    setEditingGroupId(groupId)
    setNameDraft(group.areaName)
    setDescriptionDraft(group.description || '')
    setPerPageDraft(layoutToPerPage(group.layout))
    setDraftPhotos([])
    clearFieldErrors()
    setPhase('create')
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
    setExpandedIds((prev) => new Set([...prev, target.groupId]))
    openViewer(target.groupId, target.index)
    requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    })
    return true
  }, [])

  useImperativeHandle(ref, () => ({
    openFirstIncompletePhoto,
  }), [openFirstIncompletePhoto])

  const closeViewer = () => {
    const scrollY = viewer?.scrollY || 0
    const groupId = viewer?.groupId
    setViewer(null)
    if (groupId && groupId !== '__draft__') {
      setExpandedIds((prev) => new Set([...prev, groupId]))
    }
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
      rotationDegrees: ((Number(photo.rotationDegrees) || 0) + 90) % 360,
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
    const missing = photosMissingDescription(locationWalk)
    if (missing.length > 0) {
      const n = missing.length
      setWalkError(
        n === 1
          ? '1 photo still needs a description.'
          : `${n} photos still need descriptions.`,
      )
      openFirstIncompletePhoto()
      return
    }
    setWalkError('')
    setPhase('review')
    onContinueToSignature?.()
  }

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
      {/* Saved areas always visible — never hide stored data behind confirmation */}
      {locationWalk.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {locationWalk.map((group, gi) => (
            <SavedAreaCard
              key={group.id}
              group={group}
              expanded={expandedIds.has(group.id)}
              accent={accent}
              capturing={capturing}
              globalOffset={areaOffset(group.id)}
              isFirst={gi === 0}
              isLast={gi === locationWalk.length - 1}
              onToggle={() => setExpandedIds((prev) => {
                const next = new Set(prev)
                if (next.has(group.id)) next.delete(group.id)
                else next.add(group.id)
                return next
              })}
              onEdit={() => editGroup(group.id)}
              onDelete={() => {
                updateWalk((prev) => prev.filter((g) => g.id !== group.id))
                setExpandedIds((prev) => {
                  const next = new Set(prev)
                  next.delete(group.id)
                  return next
                })
              }}
              onMoveUp={() => updateWalk((prev) => moveItem(prev, gi, gi - 1))}
              onMoveDown={() => updateWalk((prev) => moveItem(prev, gi, gi + 1))}
              onOpenPhoto={(pi) => openViewer(group.id, pi)}
              onRename={(name) => {
                if (!name) return
                updateWalk((prev) => prev.map((g) => (g.id === group.id ? { ...g, areaName: name } : g)))
                rememberArea(name)
              }}
              onLayoutChange={(n) => {
                updateWalk((prev) => prev.map((g) => (
                  g.id === group.id ? { ...g, layout: perPageToLayout(n) } : g
                )))
              }}
              onAddPhotos={(files) => handleFiles(files, group.id)}
              onRemovePhoto={(photoId) => removePhoto(group.id, photoId)}
              onRotatePhoto={(photoId) => rotatePhoto(group.id, photoId)}
            />
          ))}
        </div>
      )}

      {phase === 'create' && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 8 }}>{copy.groupNameLabel}</div>
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => {
              setNameDraft(e.target.value)
              if (e.target.value.trim()) setNameError('')
            }}
            placeholder={copy.groupNamePlaceholder}
            style={{ ...inputStyle, marginBottom: nameError ? 0 : 14, minHeight: 48 }}
            autoComplete="off"
          />
          {nameError ? <p style={{ ...fieldErrorStyle, marginBottom: 12 }}>{nameError}</p> : null}

          <div style={{ ...labelStyle, marginBottom: 8 }}>{copy.groupDescriptionLabel}</div>
          <textarea
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value)}
            placeholder={copy.groupDescriptionPlaceholder}
            rows={3}
            style={{ ...inputStyle, marginBottom: 14, minHeight: 72, resize: 'vertical' }}
          />

          {dictationSupported || recentAreas.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {dictationSupported && (
                <SecondaryButton type="button" onClick={() => (listening ? null : startDictation())}>
                  {listening ? 'Listening…' : 'Dictate'}
                </SecondaryButton>
              )}
              {recentAreas.map((name) => (
                <SecondaryButton key={name} type="button" onClick={() => { setNameDraft(name); setNameError('') }}>
                  {name}
                </SecondaryButton>
              ))}
            </div>
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
              galleryLabel="Add Multiple Photos"
            />
          </div>

          {activePhotos.length > 0 ? (
            <CaptureThumbnailGrid
              photos={activePhotos}
              numberOffset={isEditing ? areaOffset(editingGroupId) : draftPhotoOffset}
              onOpen={(pi) => openViewer(isEditing ? editingGroupId : '__draft__', pi)}
              onDelete={(photoId) => removePhoto(isEditing ? editingGroupId : '__draft__', photoId)}
              onRotate={(photoId) => rotatePhoto(isEditing ? editingGroupId : '__draft__', photoId)}
            />
          ) : null}
          {photoError ? <p style={fieldErrorStyle}>{photoError}</p> : null}

          <div style={{ marginTop: 18 }}>
            <PrimaryCTA
              type="button"
              accent={accent}
              disabled={capturing}
              onClick={saveArea}
              style={primaryTap}
            >
              {copy.saveGroup}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PrimaryCTA type="button" accent={accent} onClick={beginCreate} style={primaryTap}>
              {copy.addAnother}
            </PrimaryCTA>
            <SecondaryButton
              type="button"
              disabled={!locationWalk.length}
              onClick={continueToSignature}
              style={{ ...primaryTap, opacity: locationWalk.length ? 1 : 0.45 }}
            >
              {copy.continueReport}
            </SecondaryButton>
          </div>
        </div>
      )}

      {phase === 'review' && (
        <div>
          {locationWalk.length === 0 ? (
            <PrimaryCTA type="button" accent={accent} onClick={beginCreate} style={primaryTap}>
              {copy.createGroup}
            </PrimaryCTA>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <PrimaryCTA type="button" accent={accent} onClick={beginCreate} style={primaryTap}>
                {copy.addAnother}
              </PrimaryCTA>
              <SecondaryButton type="button" onClick={continueToSignature} style={primaryTap}>
                {copy.continueReport}
              </SecondaryButton>
            </div>
          )}
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
        />
      )}
      </div>
    </GlassSection>
  )
})
