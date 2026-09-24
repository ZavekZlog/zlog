'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  GlassSection,
  labelStyle,
  inputStyle,
  PrimaryCTA,
  SecondaryButton,
  DIARY_ACCENT,
} from '@/lib/premium-ui'
import { extractBrandColorFromFile } from '@/lib/extract-brand-color'
import {
  prepareBrandLogoFile,
  fetchBrandCompanyNameAnalysis,
} from '@/lib/prepare-brand-logo-image'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'
import { brandingPayload } from '@/lib/branding-payload'

export { brandingPayload }

const DEFAULT_BRAND_COLOR = '#FF5000'

const brandingHowToDetailsStyle = {
  marginBottom: 16,
  border: '1px solid var(--edge)',
  borderRadius: 10,
  background: 'var(--plate)',
  padding: '10px 12px',
  fontSize: 16,
  lineHeight: 1.45,
  color: 'var(--text-2)',
}

function BrandingHowToDisclosure() {
  return (
    <details style={brandingHowToDetailsStyle}>
      <summary
        style={{
          cursor: 'pointer',
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--text)',
          listStyle: 'none',
        }}
      >
        How to add your company branding
      </summary>
      <div style={{ marginTop: 10 }}>
        <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
          Adding your branding
        </p>
        <ol style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 'inherit' }}>
          <li style={{ marginBottom: 6 }}>
            Use a clear image containing your company logo — a website, letterhead or document works well.
          </li>
          <li style={{ marginBottom: 6 }}>
            Crop reasonably close to the logo. Avoid images containing several different logos.
          </li>
          <li style={{ marginBottom: 6 }}>
            Upload it here. Zlog will identify the branding colour and, where possible, the company name.
          </li>
          <li style={{ marginBottom: 6 }}>
            Check the preview and company name. You can edit either if needed.
          </li>
          <li style={{ marginBottom: 0 }}>Save. Your branding will then be applied to your report.</li>
        </ol>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)' }}>
          Tip: A clear logo on a plain background gives the best result.
        </p>
      </div>
    </details>
  )
}

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
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false)
  const [namePrefilledFromLogo, setNamePrefilledFromLogo] = useState(false)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ESLINT-BRANDING-SELECTOR-DEPS
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

    setExtracting(true)
    const hex = await extractBrandColorFromFile(file, DEFAULT_BRAND_COLOR)
    setQuickColor(hex)

    const prepared = await prepareBrandLogoFile(file)
    const logoFile = prepared.file || file
    setQuickLogoFile(logoFile)
    setLogoPreview(prepared.previewUrl || URL.createObjectURL(logoFile))

    if (!nameManuallyEdited) {
      const analyzed = await fetchBrandCompanyNameAnalysis(logoFile)
      if (analyzed.confidence === 'high' && analyzed.company_name) {
        setQuickName(analyzed.company_name)
        setNamePrefilledFromLogo(true)
      } else {
        setNamePrefilledFromLogo(false)
      }
    }

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
    setNameManuallyEdited(false)
    setNamePrefilledFromLogo(false)
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

    const extracted = quickColor || DEFAULT_BRAND_COLOR

    const ext =
      quickLogoFile.type === 'image/png'
        ? 'png'
        : quickLogoFile.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `${user.id}/branding/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('site-photos')
      .upload(path, quickLogoFile, {
        contentType: quickLogoFile.type || 'image/png',
        upsert: false,
      })
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
          className="zlog-secondary-btn"
          style={{
            background: 'var(--plate)',
            border: '1px dashed var(--edge)',
            borderRadius: 12,
            color: 'var(--text-2)',
            padding: '10px 14px',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            width: '100%',
            boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
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
            onChange={(e) => {
              setQuickName(e.target.value)
              setNameManuallyEdited(true)
              setNamePrefilledFromLogo(false)
            }}
            placeholder="e.g. ABC Construction Ltd"
          />
          {namePrefilledFromLogo && quickName ? (
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
              Detected from your logo — edit if needed.
            </p>
          ) : null}

          <label style={labelStyle}>Logo / letterhead photo</label>
          <ImageSourceButtons
            onFiles={(files) => handleLogoPicked(files[0] || null)}
            hint="We extract the primary brand colour from the image automatically."
          />
          <BrandingHowToDisclosure />

          {(logoPreview || extracting) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {logoPreview ? (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    flexShrink: 0,
                    borderRadius: 8,
                    background: quickColor || 'var(--plate)',
                    border: '1px solid var(--edge)',
                    overflow: 'hidden',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- ESLINT-BRAND-LOGO-IMG */}
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    style={{
                      display: 'block',
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                </div>
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
            <PrimaryCTA onClick={handleQuickAdd} disabled={saving || extracting} accent={accent} style={{ flex: 1 }}>
              {saving ? 'Saving…' : 'Save & use profile'}
            </PrimaryCTA>
            <SecondaryButton type="button" onClick={resetQuickAdd}>
              Cancel
            </SecondaryButton>
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
