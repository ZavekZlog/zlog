'use client'

/**
 * Location Walk — area-group workflow for all report modules.
 *
 * Phases: name area → capture photos → Save Area → Add Next / Finish → summary
 * Photos belong permanently to their area group (not one global Current Area).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'
import { AnnotationPhotoCard } from '@/components/ai-annotation/AnnotationPhotoCard'
import {
  GlassSection,
  PrimaryCTA,
  SecondaryButton,
  inputStyle,
  labelStyle,
} from '@/lib/premium-ui'
import { getAnnotationContext } from '@/lib/ai-annotation/contexts'
import { annotatePhotoFile } from '@/lib/ai-annotation/client'
import {
  collectRecentAreaNames,
  createAreaGroup,
  createAreaPhoto,
  readRecentAreas,
  rememberRecentArea,
} from '@/lib/ai-annotation/area-groups'

/** @typedef {'name' | 'active' | 'after_save' | 'summary'} WalkPhase */

function useSpeechDictation(onResult) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop?.()
    } catch {
      // ignore
    }
    recognitionRef.current = null
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const SpeechRecognition = typeof window !== 'undefined'
      && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SpeechRecognition) return false

    stop()
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-GB'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const text = event?.results?.[0]?.[0]?.transcript
      if (text) onResult(String(text).trim())
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
      return true
    } catch {
      setListening(false)
      return false
    }
  }, [onResult, stop])

  useEffect(() => () => stop(), [stop])

  const supported = typeof window !== 'undefined'
    && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  return { start, stop, listening, supported }
}

function AreaNamePrompt({
  accent,
  draft,
  onDraftChange,
  recentAreas,
  onConfirm,
  onPickRecent,
  error,
}) {
  const applyDictation = useCallback((text) => {
    if (text) onDraftChange(text)
  }, [onDraftChange])
  const { start, listening, supported } = useSpeechDictation(applyDictation)

  return (
    <div>
      <div style={{ ...labelStyle, marginBottom: 8 }}>Name this area</div>
      <input
        type="text"
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder="e.g. Ground Floor Reception"
        style={{ ...inputStyle, marginBottom: 10 }}
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onConfirm()
          }
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: recentAreas.length ? 14 : 0 }}>
        <PrimaryCTA type="button" accent={accent} onClick={onConfirm}>
          Continue
        </PrimaryCTA>
        {supported && (
          <SecondaryButton type="button" onClick={() => (listening ? null : start())}>
            {listening ? 'Listening…' : 'Dictate'}
          </SecondaryButton>
        )}
      </div>
      {recentAreas.length > 0 && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 8, marginTop: 4 }}>Recently used</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {recentAreas.map((name) => (
              <SecondaryButton key={name} type="button" onClick={() => onPickRecent(name)}>
                {name}
              </SecondaryButton>
            ))}
          </div>
        </div>
      )}
      {error && (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#ff6b6b' }}>{error}</p>
      )}
    </div>
  )
}

function SavedAreasSummary({ groups, onEdit }) {
  if (!groups.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {groups.map((group) => (
        <div
          key={group.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid var(--edge)',
            background: 'var(--plate)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
              {group.areaName}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
              {group.photos.length} photo{group.photos.length === 1 ? '' : 's'}
            </div>
          </div>
          <SecondaryButton type="button" onClick={() => onEdit(group.id)}>
            Edit
          </SecondaryButton>
        </div>
      ))}
    </div>
  )
}

/**
 * @param {object} props
 * @param {string} props.accent
 * @param {string} props.projectId
 * @param {import('@/lib/ai-annotation/contexts').AnnotationContextId} props.contextId
 * @param {Array} [props.value] — locationWalk area groups
 * @param {(next: Array) => void} props.onChange
 * @param {string} [props.title]
 * @param {() => void} [props.onFinish] — after Finish Site Walk
 * @param {(group: object) => void} [props.onAreaSaved] — after Save Area
 */
export function AiLocationWalk({
  accent,
  projectId,
  contextId = 'diary',
  value = [],
  onChange,
  title,
  onFinish,
  onAreaSaved,
}) {
  const ctx = getAnnotationContext(contextId)
  const sectionTitle = title || ctx.sectionTitle

  const locationWalk = useMemo(
    () => (Array.isArray(value) ? value : []),
    [value],
  )
  const walkRef = useRef(locationWalk)

  useEffect(() => {
    walkRef.current = locationWalk
  }, [locationWalk])

  /** @type {[WalkPhase, Function]} */
  const [phase, setPhase] = useState(() => (locationWalk.length ? 'summary' : 'name'))
  const [nameDraft, setNameDraft] = useState('')
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [error, setError] = useState('')
  const [busyPhotoId, setBusyPhotoId] = useState(null)
  const [capturing, setCapturing] = useState(false)
  const [lastSavedName, setLastSavedName] = useState('')
  const [lastSavedCount, setLastSavedCount] = useState(0)
  const [storedRecent, setStoredRecent] = useState(() => (
    projectId ? readRecentAreas(projectId) : []
  ))

  const recentAreas = useMemo(
    () => collectRecentAreaNames(locationWalk, storedRecent),
    [locationWalk, storedRecent],
  )

  const activeGroup = useMemo(
    () => locationWalk.find((g) => g.id === activeGroupId) || null,
    [locationWalk, activeGroupId],
  )

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

  const openNamePhase = useCallback(() => {
    setNameDraft('')
    setActiveGroupId(null)
    setRenaming(false)
    setError('')
    setPhase('name')
  }, [])

  const startArea = useCallback((areaName) => {
    const name = String(areaName || '').trim()
    if (!name) {
      setError('Enter an area name to continue.')
      return
    }
    const group = createAreaGroup(name)
    updateWalk((prev) => [...prev, group])
    rememberArea(name)
    setActiveGroupId(group.id)
    setRenameDraft(name)
    setRenaming(false)
    setError('')
    setPhase('active')
  }, [rememberArea, updateWalk])

  const editGroup = useCallback((groupId) => {
    const group = locationWalk.find((g) => g.id === groupId)
    if (!group) return
    setActiveGroupId(groupId)
    setRenameDraft(group.areaName)
    setRenaming(false)
    setError('')
    setPhase('active')
  }, [locationWalk])

  const commitRename = useCallback(() => {
    const name = renameDraft.trim()
    if (!name || !activeGroupId) return
    updateWalk((prev) => prev.map((g) => (
      g.id === activeGroupId ? { ...g, areaName: name } : g
    )))
    rememberArea(name)
    setRenaming(false)
  }, [renameDraft, activeGroupId, updateWalk, rememberArea])

  const handleFiles = async (files) => {
    if (!activeGroup) return
    const list = Array.from(files || []).filter((f) => f instanceof Blob)
    if (!list.length) return

    setCapturing(true)
    setError('')
    const areaName = activeGroup.areaName

    for (const file of list) {
      const preview = URL.createObjectURL(file)
      let description = ''
      try {
        const result = await annotatePhotoFile({
          file,
          contextId: ctx.id,
          area: areaName,
        })
        description = result.description || ''
      } catch (err) {
        setError(err?.message || 'AI description failed — you can type one manually.')
      }

      const photo = createAreaPhoto({ file, preview, description })
      updateWalk((prev) => prev.map((g) => (
        g.id === activeGroup.id
          ? { ...g, photos: [...g.photos, photo] }
          : g
      )))
    }

    setCapturing(false)
  }

  const updatePhotoDescription = (photoId, text) => {
    if (!activeGroupId) return
    updateWalk((prev) => prev.map((g) => {
      if (g.id !== activeGroupId) return g
      return {
        ...g,
        photos: g.photos.map((p) => (
          p.id === photoId ? { ...p, acceptedDescription: text } : p
        )),
      }
    }))
  }

  const removePhoto = (photoId) => {
    if (!activeGroupId) return
    updateWalk((prev) => prev.map((g) => {
      if (g.id !== activeGroupId) return g
      const target = g.photos.find((p) => p.id === photoId)
      if (target?.file && target.preview) {
        try { URL.revokeObjectURL(target.preview) } catch { /* ignore */ }
      }
      return { ...g, photos: g.photos.filter((p) => p.id !== photoId) }
    }))
  }

  const regeneratePhoto = async (photoId) => {
    if (!activeGroup) return
    const photo = activeGroup.photos.find((p) => p.id === photoId)
    if (!photo?.file && !photo?.preview) return

    setBusyPhotoId(photoId)
    setError('')
    try {
      let file = photo.file
      if (!file && photo.preview) {
        const res = await fetch(photo.preview)
        const blob = await res.blob()
        file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' })
      }
      const result = await annotatePhotoFile({
        file,
        contextId: ctx.id,
        area: activeGroup.areaName,
      })
      updatePhotoDescription(photoId, result.description || '')
    } catch (err) {
      setError(err?.message || 'Could not regenerate description')
    } finally {
      setBusyPhotoId(null)
    }
  }

  const saveArea = () => {
    if (!activeGroup) return
    if (!activeGroup.photos.length) {
      setError('Add at least one photo before saving this area.')
      return
    }
    const saved = walkRef.current.find((g) => g.id === activeGroup.id) || activeGroup
    setLastSavedName(saved.areaName)
    setLastSavedCount(saved.photos.length)
    setActiveGroupId(null)
    setError('')
    setPhase('after_save')
    onAreaSaved?.(saved)
  }

  const finishWalk = () => {
    setActiveGroupId(null)
    setPhase('summary')
    setError('')
    onFinish?.()
  }

  const startWalkAgain = () => {
    openNamePhase()
  }

  return (
    <GlassSection title={sectionTitle} accent={accent}>
      {phase === 'name' && (
        <AreaNamePrompt
          accent={accent}
          draft={nameDraft}
          onDraftChange={setNameDraft}
          recentAreas={recentAreas}
          onConfirm={() => startArea(nameDraft)}
          onPickRecent={(name) => startArea(name)}
          error={error}
        />
      )}

      {phase === 'active' && activeGroup && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Area</div>
          {renaming ? (
            <div style={{ marginBottom: 14 }}>
              <input
                type="text"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                style={{ ...inputStyle, marginBottom: 10 }}
                autoComplete="off"
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <PrimaryCTA type="button" accent={accent} onClick={commitRename}>
                  Save name
                </PrimaryCTA>
                <SecondaryButton type="button" onClick={() => { setRenaming(false); setRenameDraft(activeGroup.areaName) }}>
                  Cancel
                </SecondaryButton>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 14,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
                {activeGroup.areaName}
              </div>
              <SecondaryButton type="button" onClick={() => { setRenameDraft(activeGroup.areaName); setRenaming(true) }}>
                Change name
              </SecondaryButton>
            </div>
          )}

          <ImageSourceButtons
            onFiles={handleFiles}
            multiple
            disabled={capturing || Boolean(busyPhotoId)}
            cameraLabel="Take Photo"
            galleryLabel="Add Photos"
          />

          {capturing && (
            <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-2)' }}>
              Adding photo…
            </p>
          )}

          <div style={{ margin: '14px 0 10px', fontSize: 13, color: 'var(--text-2)' }}>
            {activeGroup.photos.length} photo{activeGroup.photos.length === 1 ? '' : 's'} added
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {activeGroup.photos.map((photo) => (
              <AnnotationPhotoCard
                key={photo.id}
                photo={photo}
                regenerating={busyPhotoId === photo.id}
                onDescriptionChange={(text) => updatePhotoDescription(photo.id, text)}
                onRegenerate={() => regeneratePhoto(photo.id)}
                onRemove={() => removePhoto(photo.id)}
              />
            ))}
          </div>

          {error && (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#ff6b6b' }}>{error}</p>
          )}

          <PrimaryCTA
            type="button"
            accent={accent}
            disabled={capturing || !activeGroup.photos.length}
            onClick={saveArea}
          >
            Save Area
          </PrimaryCTA>
        </div>
      )}

      {phase === 'after_save' && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>
            Area saved
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 16 }}>
            {lastSavedName} · {lastSavedCount} photo{lastSavedCount === 1 ? '' : 's'}
          </div>
          <div style={{ ...labelStyle, marginBottom: 10 }}>Add another area?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PrimaryCTA type="button" accent={accent} onClick={openNamePhase}>
              + Add Next Area
            </PrimaryCTA>
            <SecondaryButton type="button" onClick={finishWalk}>
              Finish Site Walk
            </SecondaryButton>
          </div>
        </div>
      )}

      {phase === 'summary' && (
        <div>
          {locationWalk.length === 0 ? (
            <PrimaryCTA type="button" accent={accent} onClick={startWalkAgain}>
              Start Location Walk
            </PrimaryCTA>
          ) : (
            <>
              <SavedAreasSummary groups={locationWalk} onEdit={editGroup} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                <PrimaryCTA type="button" accent={accent} onClick={openNamePhase}>
                  + Add Next Area
                </PrimaryCTA>
              </div>
            </>
          )}
        </div>
      )}
    </GlassSection>
  )
}
