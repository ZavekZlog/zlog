'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  PremiumShell,
  GlassSection,
  labelStyle,
  inputStyle,
  PrimaryCTA,
  SecondaryButton,
  DIARY_ACCENT,
} from '@/lib/premium-ui'
import { extractBrandColorFromFile } from '@/lib/extract-brand-color'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'

const DEFAULT_BRAND_COLOR = '#FF5000'

async function signedLogoUrl(supabase, path) {
  if (!path) return null
  if (path.startsWith('http')) return path
  const { data } = await supabase.storage.from('site-photos').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

export default function BrandingSettingsPage() {
  const supabase = createClient()
  const [brandings, setBrandings] = useState([])
  const [previews, setPreviews] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [companyName, setCompanyName] = useState('')
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [extracting, setExtracting] = useState(false)
  const [isDefault, setIsDefault] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setBrandings([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('company_brandings')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('company_name')
    const rows = data || []
    setBrandings(rows)

    const nextPreviews = {}
    await Promise.all(rows.map(async (row) => {
      if (!row.logo_url) return
      nextPreviews[row.id] = await signedLogoUrl(supabase, row.logo_url)
    }))
    setPreviews(nextPreviews)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const resetForm = () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setCompanyName('')
    setBrandColor(DEFAULT_BRAND_COLOR)
    setLogoFile(null)
    setLogoPreview(null)
    setExtracting(false)
    setIsDefault(false)
    setEditingId(null)
  }

  const startEdit = (row) => {
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setEditingId(row.id)
    setCompanyName(row.company_name || '')
    setBrandColor(row.brand_color || DEFAULT_BRAND_COLOR)
    setIsDefault(!!row.is_default)
    setLogoFile(null)
    setLogoPreview(null)
  }

  const handleLogoPicked = async (file) => {
    setError('')
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    if (!file) {
      setLogoFile(null)
      setLogoPreview(null)
      return
    }

    const isPdf =
      file.type === 'application/pdf' ||
      /\.pdf$/i.test(file.name || '')
    const isImage =
      (file.type && file.type.startsWith('image/')) ||
      /\.(jpe?g|png|webp|gif|heic|heif|bmp|tiff?)$/i.test(file.name || '')

    if (isPdf || !isImage) {
      setLogoFile(null)
      setLogoPreview(null)
      setError('Use a photo or screenshot of the logo/letterhead (not a PDF) so we can extract the brand colour.')
      return
    }

    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setExtracting(true)
    const hex = await extractBrandColorFromFile(file, DEFAULT_BRAND_COLOR)
    setBrandColor(hex)
    setExtracting(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!companyName.trim()) {
      setError('Company name is required')
      return
    }
    if (!editingId && !logoFile) {
      setError('Upload or photograph a logo / letterhead so we can pick the brand colour')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('You must be signed in')
      setSaving(false)
      return
    }

    let logoUrl = undefined
    let colorToSave = brandColor || DEFAULT_BRAND_COLOR
    if (logoFile) {
      colorToSave = await extractBrandColorFromFile(logoFile, colorToSave)
      setBrandColor(colorToSave)
      const ext = logoFile.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${user.id}/branding/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('site-photos')
        .upload(path, logoFile, { contentType: logoFile.type, upsert: false })
      if (upErr) {
        setError(upErr.message)
        setSaving(false)
        return
      }
      logoUrl = path
    }

    if (isDefault) {
      await supabase
        .from('company_brandings')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('is_default', true)
    }

    if (editingId) {
      const patch = {
        company_name: companyName.trim(),
        brand_color: colorToSave,
        is_default: isDefault,
        updated_at: new Date().toISOString(),
      }
      if (logoUrl !== undefined) patch.logo_url = logoUrl
      const { error: updErr } = await supabase
        .from('company_brandings')
        .update(patch)
        .eq('id', editingId)
        .eq('user_id', user.id)
      if (updErr) {
        setError(updErr.message)
        setSaving(false)
        return
      }
      setSuccess('Branding profile updated')
    } else {
      const { error: insErr } = await supabase.from('company_brandings').insert({
        user_id: user.id,
        company_name: companyName.trim(),
        brand_color: colorToSave,
        logo_url: logoUrl || null,
        is_default: isDefault || brandings.length === 0,
      })
      if (insErr) {
        setError(insErr.message)
        setSaving(false)
        return
      }
      setSuccess('Branding profile created')
    }

    resetForm()
    setSaving(false)
    await load()
  }

  const setAsDefault = async (row) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('company_brandings')
      .update({ is_default: false })
      .eq('user_id', user.id)
      .eq('is_default', true)
    await supabase
      .from('company_brandings')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('user_id', user.id)
    await load()
  }

  const removeProfile = async (row) => {
    if (!window.confirm(`Delete branding for “${row.company_name}”?`)) return
    await supabase.from('company_brandings').delete().eq('id', row.id)
    if (editingId === row.id) resetForm()
    await load()
  }

  return (
    <PremiumShell
      title="Company branding"
      reportName="PDF report profiles"
      meta="Logos and colours for PDF reports"
      backHref="/dashboard"
      accent={DIARY_ACCENT}
    >
      {error && (
        <div style={{ background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', color: '#ff6b6b', padding: '12px 14px', fontSize: 14, marginBottom: 16, borderRadius: 10 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', padding: '12px 14px', fontSize: 14, marginBottom: 16, borderRadius: 10 }}>
          {success}
        </div>
      )}

      <GlassSection title={editingId ? 'Edit profile' : 'Add profile'} accent={DIARY_ACCENT}>
        <form onSubmit={handleSave}>
          <label style={labelStyle}>Company name</label>
          <input
            style={inputStyle}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Forge Construction Ltd"
            required
          />

          <label style={labelStyle}>Logo / letterhead photo</label>
          <ImageSourceButtons
            onFiles={(files) => handleLogoPicked(files[0] || null)}
            hint="Primary colour is extracted from the image automatically."
          />
          <div style={{ height: 8 }} />

          {(logoPreview || brandColor) && (
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
                    background: brandColor,
                    border: '1px solid var(--edge)',
                  }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  {extracting ? 'Reading colour…' : `Brand colour ${brandColor}`}
                </span>
              </div>
            </div>
          )}

          <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Set as default branding
          </label>

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <PrimaryCTA type="submit" disabled={saving || extracting} accent={DIARY_ACCENT} style={{ flex: 1 }}>
              {saving ? 'Saving…' : (editingId ? 'Update profile' : 'Save profile')}
            </PrimaryCTA>
            {editingId && (
              <SecondaryButton type="button" onClick={resetForm}>
                Cancel
              </SecondaryButton>
            )}
          </div>
        </form>
      </GlassSection>

      <GlassSection title="Saved profiles" accent={DIARY_ACCENT}>
        {loading ? (
          <p style={{ color: 'var(--text-2)', margin: 0 }}>Loading…</p>
        ) : brandings.length === 0 ? (
          <p style={{ color: 'var(--text-2)', margin: 0 }}>No branding profiles yet. Add one above.</p>
        ) : (
          brandings.map((row) => (
            <div
              key={row.id}
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                padding: '14px 0',
                borderBottom: '1px solid var(--edge)',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 8,
                  background: row.brand_color || DEFAULT_BRAND_COLOR,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '1px solid var(--edge)',
                }}
              >
                {previews[row.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[row.id]} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : null}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                  {row.company_name}
                  {row.is_default ? ' · default' : ''}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{row.brand_color}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {!row.is_default && (
                  <button type="button" onClick={() => setAsDefault(row)} style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer', textAlign: 'right' }}>
                    Set default
                  </button>
                )}
                <button type="button" onClick={() => startEdit(row)} style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'right' }}>
                  Edit
                </button>
                <button type="button" onClick={() => removeProfile(row)} style={{ background: 'transparent', border: 'none', color: '#ff6b6b', fontSize: 12, cursor: 'pointer', textAlign: 'right' }}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </GlassSection>
    </PremiumShell>
  )
}
