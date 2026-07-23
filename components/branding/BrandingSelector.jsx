'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  GlassSection,
  labelStyle,
  inputStyle,
  primaryButtonStyle,
  DIARY_ACCENT,
} from '@/lib/premium-ui'
import { extractBrandColorFromFile } from '@/lib/extract-brand-color'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'

const DEFAULT_BRAND_COLOR = '#FF5000'

/**
 * Loads company_brandings for the signed-in user and renders a Report Branding selector.
 * value shape: { brandingId, brandColor, brandLogoUrl, companyName } | null
 */
export function BrandingSelector({
  value,
  onChange,
  accent = DIARY_ACCENT,
  title = 'Report Branding',
  autoSelectDefault = true,
  compact = false,
}) {
  const supabase = createClient()
  const [brandings, setBrandings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickColor, setQuickColor] = useState(DEFAULT_BRAND_COLOR)
  const [quickLogoFile, setQuickLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setBrandings([])
      setLoading(false)
      return []
    }
    const { data } = await supabase
      .from('company_brandings')
      .select('id, company_name, logo_url, brand_color, is_default')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('company_name')
    const rows = data || []
    setBrandings(rows)
    setLoading(false)
    return rows
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const rows = await refresh()
      if (cancelled || !autoSelectDefault || value?.brandingId) return
      const def = (rows || []).find((b) => b.is_default) || (rows || [])[0]
      if (def && onChange) {
        onChange({
          brandingId: def.id,
          brandColor: def.brand_color || DEFAULT_BRAND_COLOR,
          brandLogoUrl: def.logo_url || null,
          companyName: def.company_name || '',
        })
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelectDefault])

  useEffect(() => () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview)
  }, [logoPreview])

  const selectId = (id) => {
    if (!id) {
      onChange?.(null)
      return
    }
    const b = brandings.find((row) => row.id === id)
    if (!b) return
    onChange?.({
      brandingId: b.id,
      brandColor: b.brand_color || DEFAULT_BRAND_COLOR,
      brandLogoUrl: b.logo_url || null,
      companyName: b.company_name || '',
    })
  }

  const handleLogoPicked = async (file) => {
    setError('')
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    if (!file) {
      setQuickLogoFile(null)
      setLogoPreview(null)
      setQuickColor(DEFAULT_BRAND_COLOR)
      return
    }

    const isPdf =
      file.type === 'application/pdf' ||
      /\.pdf$/i.test(file.name || '')
    const isImage =
      (file.type && file.type.startsWith('image/')) ||
      /\.(jpe?g|png|webp|gif|heic|heif|bmp|tiff?)$/i.test(file.name || '')

    if (isPdf || !isImage) {
      setQuickLogoFile(null)
      setLogoPreview(null)
      setQuickColor(DEFAULT_BRAND_COLOR)
      setError('Use a photo or screenshot of the logo/letterhead so we can extract the brand colour.')
      return
    }

    setQuickLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setExtracting(true)
    const hex = await extractBrandColorFromFile(file, DEFAULT_BRAND_COLOR)
    setQuickColor(hex)
    setExtracting(false)
  }

  const resetQuickAdd = () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setQuickName('')
    setQuickColor(DEFAULT_BRAND_COLOR)
    setQuickLogoFile(null)
    setLogoPreview(null)
    setShowQuickAdd(false)
    setExtracting(false)
  }

  const handleQuickAdd = async (e) => {
    e.preventDefault()
    if (!quickName.trim()) {
      setError('Company name is required')
      return
    }
    if (!quickLogoFile) {
      setError('Upload or photograph a logo / letterhead so we can pick the brand colour')
      return
    }
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in')
      setSaving(false)
      return
    }

    let extracted = quickColor
    if (!extracted || extracted === DEFAULT_BRAND_COLOR) {
      extracted = await extractBrandColorFromFile(quickLogoFile, DEFAULT_BRAND_COLOR)
      setQuickColor(extracted)
    }

    const ext = quickLogoFile.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `${user.id}/branding/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('site-photos')
      .upload(path, quickLogoFile, { contentType: quickLogoFile.type, upsert: false })
    if (upErr) {
      setError(upErr.message)
      setSaving(false)
      return
    }

    const makeDefault = brandings.length === 0
    const { data, error: insErr } = await supabase
      .from('company_brandings')
      .insert({
        user_id: user.id,
        company_name: quickName.trim(),
        brand_color: extracted || DEFAULT_BRAND_COLOR,
        logo_url: path,
        is_default: makeDefault,
      })
      .select('id, company_name, logo_url, brand_color, is_default')
      .single()

    if (insErr || !data) {
      setError(insErr?.message || 'Failed to save branding')
      setSaving(false)
      return
    }

    // Refresh dropdown list, then one-tap select the new profile for this report
    const rows = await refresh()
    const created = rows.find((r) => r.id === data.id) || data
    onChange?.({
      brandingId: created.id,
      brandColor: created.brand_color || extracted || DEFAULT_BRAND_COLOR,
      brandLogoUrl: created.logo_url || path,
      companyName: created.company_name || quickName.trim(),
    })
    resetQuickAdd()
    setSaving(false)
  }

  const body = (
    <>
      {error && (
        <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{error}</div>
      )}
      <label style={labelStyle}>Company profile</label>
      <select
        style={{ ...inputStyle, marginBottom: 12 }}
        value={value?.brandingId || ''}
        onChange={(e) => selectId(e.target.value)}
        disabled={loading}
      >
        <option value="">No branding</option>
        {brandings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.company_name}{b.is_default ? ' (default)' : ''}
          </option>
        ))}
      </select>

      {value?.brandColor && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: value.brandColor,
              border: '1px solid var(--edge)',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {value.companyName || 'Selected'} · {value.brandColor}
          </span>
        </div>
      )}

      {!showQuickAdd ? (
        <button
          type="button"
          onClick={() => setShowQuickAdd(true)}
          style={{
            background: 'transparent',
            border: '1px dashed var(--edge)',
            borderRadius: 10,
            color: 'var(--text-2)',
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            width: '100%',
          }}
        >
          + Quick add client branding
        </button>
      ) : (
        <div style={{ borderTop: '1px solid var(--edge)', paddingTop: 14, marginTop: 4 }}>
          <label style={labelStyle}>Company name</label>
          <input
            style={inputStyle}
            value={quickName}
            onChange={(e) => setQuickName(e.target.value)}
            placeholder="e.g. ABC Construction Ltd"
          />

          <label style={labelStyle}>Logo / letterhead photo</label>
          <ImageSourceButtons
            onFiles={(files) => handleLogoPicked(files[0] || null)}
            hint="We extract the primary brand colour from the image automatically."
          />
          <div style={{ height: 8 }} />

          {(logoPreview || extracting) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 8, background: '#fff', border: '1px solid var(--edge)' }}
                />
              ) : null}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: quickColor,
                    border: '1px solid var(--edge)',
                  }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  {extracting ? 'Reading colour…' : `Brand colour ${quickColor}`}
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={handleQuickAdd} disabled={saving || extracting} style={primaryButtonStyle(accent, saving || extracting)}>
              {saving ? 'Saving…' : 'Save & use profile'}
            </button>
            <button
              type="button"
              onClick={resetQuickAdd}
              style={{
                background: 'transparent',
                border: '1px solid var(--edge)',
                borderRadius: 10,
                color: 'var(--text-2)',
                padding: '12px 16px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )

  if (compact) {
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ ...labelStyle, marginBottom: 10 }}>{title}</div>
        {body}
      </div>
    )
  }

  return (
    <GlassSection title={title} accent={accent}>
      {body}
    </GlassSection>
  )
}

/** Snapshot fields to persist on a report row */
export function brandingPayload(selection) {
  if (!selection?.brandingId) {
    return {
      branding_id: null,
      brand_color: null,
      brand_logo_url: null,
    }
  }
  return {
    branding_id: selection.brandingId,
    brand_color: selection.brandColor || null,
    brand_logo_url: selection.brandLogoUrl || null,
  }
}
