'use client'

import {
  GlassSection,
  SecondaryButton,
  PrimaryCTA,
  labelStyle,
  inputStyle,
  DIARY_ACCENT,
  typeTokens,
  sectionTitleStyle,
} from '@/lib/premium-ui'
import { ImageSourceButtons } from '@/components/ImageSourceButtons'
import { SETUP_COVER_PREVIEW_IMG_STYLE } from '@/lib/diary-setup-cover-preview'
import { ProjectDatesFields } from '@/components/project/ProjectDatesFields'
import { ProjectStickyFields } from '@/components/project/ProjectStickyFields'
import { showProjectDatesOnSetup } from '@/lib/diary-setup-project-dates'
import { SITE_DIARY_SHIFT_OPTIONS, hydrateShift } from '@/lib/diary-setup-shift'

const setupInputStyle = {
  ...inputStyle,
  minHeight: 48,
  fontSize: 16,
  padding: '14px 16px',
  marginBottom: 20,
}

const setupLabelStyle = {
  ...labelStyle,
  fontSize: 13,
  letterSpacing: '0.08em',
  marginBottom: 10,
  color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
}

const logoControlButtonStyle = {
  width: '100%',
  height: '100%',
  minHeight: 0,
  padding: '8px 10px',
  boxSizing: 'border-box',
}

const LOGO_PREVIEW_BACKDROP_FALLBACK = 'color-mix(in srgb, var(--plate) 70%, var(--ink))'


const brandingHowToDetailsStyle = {
  marginBottom: 14,
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

export function SiteDiaryProjectDetailsSection(props) {
  const {
    editingReportId,
    existingProjects,
    projectName,
    projectAddress,
    projectManager,
    workingDaysPerWeek,
    currentPhase,
    projectStartDate,
    projectPlannedCompletionDate,
    projectDatesError,
    shift,
    projectReference,
    reportDate,
    reportingCompany,
    reportingCompanyManuallyEdited,
    namePrefilledFromLogo,
    logoSuggestedCompanyName,
    showLogoCompanyManualHint,
    logoPreview,
    logoPreviewBackdrop,
    reportingOnBehalfOf,
    author,
    authorRole,
    coverPhoto,
    stickyFieldsError,
    projectNameInputRef,
    authorInputRef,
    reportingOnBehalfOfInputRef,
    reportDateInputRef,
    reportingCompanyUserInteractedRef,
    reportingCompanyManuallyEditedRef,
    handleProjectNameChange,
    handleStickyFieldsChange,
    setCurrentPhase,
    handleProjectDatesChange,
    setShift,
    setProjectReference,
    setReportDate,
    setReportingCompany,
    setReportingCompanyManuallyEdited,
    setNamePrefilledFromLogo,
    setLogoSuggestedCompanyName,
    setShowLogoCompanyManualHint,
    applyLogoSuggestedCompanyName,
    handleLogoFiles,
    removeLogo,
    setReportingOnBehalfOf,
    setAuthor,
    setAuthorRole,
    onCoverDrop,
    removeCoverPhoto,
  } = props

  return (
    <>
      <GlassSection
        title="Project Details"
        accent={DIARY_ACCENT}
        style={{ paddingTop: 18, paddingBottom: 18 }}
      >
        <label
          style={{
            ...setupLabelStyle,
            fontSize: 14,
            letterSpacing: '0.06em',
            marginBottom: 8,
            color: 'var(--text)',
          }}
        >
          Project Name *
        </label>
        <input
          ref={projectNameInputRef}
          value={projectName}
          onChange={editingReportId ? undefined : handleProjectNameChange}
          readOnly={Boolean(editingReportId)}
          list={!editingReportId && existingProjects.length > 0 ? 'diary-setup-project-names' : undefined}
          placeholder={editingReportId ? undefined : 'Select an existing project or type a new name'}
          autoComplete={editingReportId ? 'off' : 'organization'}
          style={{ ...setupInputStyle, marginBottom: 16 }}
          required
          aria-label="Project Name"
          aria-readonly={editingReportId ? 'true' : undefined}
        />
        {!editingReportId && existingProjects.length > 0 ? (
          <datalist id="diary-setup-project-names">
            {existingProjects.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        ) : null}

        <ProjectStickyFields
          projectAddress={projectAddress}
          projectManager={projectManager}
          workingDaysPerWeek={workingDaysPerWeek}
          onChange={handleStickyFieldsChange}
          error={stickyFieldsError}
        />

        <label style={setupLabelStyle}>Current Phase</label>
        <input
          type="text"
          value={currentPhase}
          onChange={(e) => setCurrentPhase(e.target.value)}
          placeholder="e.g. Groundworks"
          style={setupInputStyle}
        />

        {showProjectDatesOnSetup() ? (
          <div style={{ marginBottom: 4 }}>
            <ProjectDatesFields
              startDate={projectStartDate}
              plannedCompletionDate={projectPlannedCompletionDate}
              onChange={handleProjectDatesChange}
              error={projectDatesError}
            />
          </div>
        ) : null}

        <label style={setupLabelStyle}>Shift *</label>
        <select
          value={shift}
          onChange={(e) => setShift(hydrateShift(e.target.value))}
          style={{ ...setupInputStyle, cursor: 'pointer' }}
          aria-label="Shift"
          required
        >
          <option value="Day">Day</option>
          <option value="Back">Back</option>
          <option value="Night">Night</option>
          {!SITE_DIARY_SHIFT_OPTIONS.includes(shift) && shift ? (
            <option value={shift}>{shift}</option>
          ) : null}
        </select>

        <label style={setupLabelStyle}>Project Reference</label>
        <input
          value={projectReference}
          onChange={(e) => setProjectReference(e.target.value)}
          placeholder="Optional job or reference number"
          style={setupInputStyle}
        />

        <label style={setupLabelStyle}>Report Date *</label>
        <input
          ref={reportDateInputRef}
          type="date"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          style={{ ...setupInputStyle, marginBottom: 0 }}
          required
        />
      </GlassSection>

      <GlassSection accent={DIARY_ACCENT}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(7.5rem, 0.4fr) minmax(0, 0.6fr)',
            gap: 12,
            alignItems: 'center',
            marginTop: 4,
            marginBottom: 16,
          }}
        >
          <h2
            className="premium-section-title"
            style={{ ...sectionTitleStyle, margin: 0, marginBottom: 0 }}
          >
            Reporting Company
          </h2>
          <input
            value={reportingCompany}
            onPointerDown={() => {
              reportingCompanyUserInteractedRef.current = true
            }}
            onKeyDown={() => {
              reportingCompanyUserInteractedRef.current = true
            }}
            onChange={(e) => {
              setReportingCompany(e.target.value)
              if (reportingCompanyUserInteractedRef.current) {
                setReportingCompanyManuallyEdited(true)
                reportingCompanyManuallyEditedRef.current = true
                setNamePrefilledFromLogo(false)
                setLogoSuggestedCompanyName(null)
                setShowLogoCompanyManualHint(false)
              }
            }}
            placeholder="Your company name"
            autoComplete="organization"
            style={{ ...setupInputStyle, marginBottom: 0 }}
            aria-label="Reporting Company Name"
          />
        </div>
        {namePrefilledFromLogo && reportingCompany ? (
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px' }}>
            Detected from your logo — edit if needed.
          </p>
        ) : null}
        {logoSuggestedCompanyName && !reportingCompanyManuallyEdited ? (
          <p
            style={{
              fontSize: 15,
              color: 'var(--text-2)',
              margin: '0 0 12px',
              lineHeight: 1.45,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '8px 10px',
            }}
          >
            <span>Logo suggests {logoSuggestedCompanyName}</span>
            <button
              type="button"
              onClick={applyLogoSuggestedCompanyName}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                fontSize: 15,
                fontWeight: 600,
                color: DIARY_ACCENT,
                cursor: 'pointer',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >
              Use {logoSuggestedCompanyName}
            </button>
          </p>
        ) : null}
        {showLogoCompanyManualHint && !reportingCompanyManuallyEdited ? (
          <p style={{ fontSize: 14, color: 'var(--text-3)', margin: '0 0 12px', lineHeight: 1.45 }}>
            Company name wasn&apos;t detected — you can enter it manually.
          </p>
        ) : null}

        <label style={{ ...setupLabelStyle, marginBottom: 6 }}>LOGO</label>
        <p
          style={{
            ...typeTokens.helper,
            margin: '0 0 8px',
            maxWidth: '36em',
          }}
        >
          Your logo helps Zlog create your report’s corporate branding, including colours and report styling.
        </p>
        <BrandingHowToDisclosure />
        {logoPreview ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'flex-start',
              marginBottom: 14,
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                width: 'fit-content',
                maxWidth: '100%',
                maxHeight: 92,
                height: 'fit-content',
                borderRadius: 12,
                border: '1px solid var(--edge)',
                overflow: 'hidden',
                flexShrink: 0,
                background: logoPreviewBackdrop || LOGO_PREVIEW_BACKDROP_FALLBACK,
              }}
            >
              <img
                src={logoPreview}
                alt="Reporting company logo preview"
                style={{
                  display: 'block',
                  maxHeight: '100%',
                  maxWidth: '100%',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                }}
              />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateRows: '1fr 1fr',
                gap: 8,
                height: 92,
                minHeight: 92,
                minWidth: 108,
                flex: '1 1 108px',
              }}
            >
              <div style={{ position: 'relative', minHeight: 0 }}>
                <SecondaryButton type="button" style={logoControlButtonStyle}>
                  Replace
                </SecondaryButton>
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Replace reporting company logo"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) void handleLogoFiles([file])
                  }}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: 'pointer',
                    fontSize: 16,
                  }}
                />
              </div>
              <SecondaryButton type="button" onClick={removeLogo} style={logoControlButtonStyle}>
                Remove
              </SecondaryButton>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 0 }}>
            <ImageSourceButtons
              onFiles={(files) => { void handleLogoFiles(files) }}
              cameraLabel="Take Photo"
              galleryLabel="Upload Photo"
              stacked
            />
          </div>
        )}
      </GlassSection>

      <GlassSection title="Reporting On Behalf Of" accent={DIARY_ACCENT}>
        <input
          ref={reportingOnBehalfOfInputRef}
          value={reportingOnBehalfOf}
          onChange={(e) => setReportingOnBehalfOf(e.target.value)}
          placeholder="Client, main contractor, or organisation"
          autoComplete="organization"
          style={{ ...setupInputStyle, marginBottom: 0 }}
          aria-label="Reporting On Behalf Of"
          required
        />
      </GlassSection>

      <GlassSection title="Author" accent={DIARY_ACCENT}>
        <label style={setupLabelStyle}>Author Name *</label>
        <input
          ref={authorInputRef}
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          style={setupInputStyle}
          required
        />

        <label style={setupLabelStyle}>Author Role</label>
        <input
          type="text"
          value={authorRole}
          onChange={(e) => setAuthorRole(e.target.value)}
          placeholder="e.g. Site Manager"
          autoComplete="organization-title"
          style={{ ...setupInputStyle, marginBottom: 0 }}
        />
      </GlassSection>

      <GlassSection title="Cover photo" accent={DIARY_ACCENT}>
        {coverPhoto?.preview ? (
          <div style={{ marginBottom: 0 }}>
            <img
              src={coverPhoto.preview}
              alt="Cover"
              style={SETUP_COVER_PREVIEW_IMG_STYLE}
            />
            <button
              type="button"
              onClick={removeCoverPhoto}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'color-mix(in srgb, var(--danger) 72%, var(--text))',
                fontSize: 14,
                padding: 0,
                cursor: 'pointer',
              }}
            >
              Remove cover photo
            </button>
          </div>
        ) : coverPhoto?.storagePath ? (
          <div style={{ marginBottom: 0 }}>
            <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.45 }}>
              Cover photo is attached to this diary.
            </p>
            <button
              type="button"
              onClick={removeCoverPhoto}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'color-mix(in srgb, var(--danger) 72%, var(--text))',
                fontSize: 14,
                padding: 0,
                cursor: 'pointer',
              }}
            >
              Remove cover photo
            </button>
            <div style={{ marginTop: 10 }}>
              <ImageSourceButtons onFiles={onCoverDrop} hint="Replace cover image" />
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 0 }}>
            <ImageSourceButtons onFiles={onCoverDrop} hint="One cover image for this report" />
          </div>
        )}
      </GlassSection>
    
    </>
  )
}

/**
 * Inline Project Details on the Site Diary workbench — compact summary + expandable editor.
 */
export function SiteDiaryWorkbenchProjectDetails({
  summary = {},
  expanded = false,
  onToggleExpanded,
  sectionProps,
  onSaveProjectDetails,
  saving = false,
  loading = false,
  error = '',
  detailsTouchedRef,
  editingReportId,
}) {
  const {
    projectName = '',
    projectReference = '',
    reportDateDisplay = '',
    shiftLabel = '',
    reportingCompany = '',
    logoPreview = null,
  } = summary

  const summaryLine = [
    reportDateDisplay,
    shiftLabel,
    projectReference,
    reportingCompany,
  ].filter(Boolean).join(' · ')

  return (
    <div
      style={{
        background: 'var(--plate)',
        border: '1px solid var(--edge)',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: 16,
        boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
      }}
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        {logoPreview ? (
          <img
            src={logoPreview}
            alt=""
            style={{
              width: 48,
              height: 48,
              objectFit: 'contain',
              borderRadius: 8,
              background: 'color-mix(in srgb, var(--ink) 40%, var(--plate))',
              border: '1px solid var(--edge)',
              flexShrink: 0,
              padding: 4,
            }}
          />
        ) : null}
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
            {projectName || 'Project'}
          </p>
          {summaryLine ? (
            <p style={{ margin: '6px 0 0', fontSize: 14, color: 'color-mix(in srgb, var(--text) 82%, var(--text-2))', lineHeight: 1.45 }}>
              {summaryLine}
            </p>
          ) : null}
        </div>
      </div>

      {typeof onToggleExpanded === 'function' ? (
        <SecondaryButton
          type="button"
          onClick={onToggleExpanded}
          style={{ width: '100%', minHeight: 48, marginTop: 12 }}
          aria-expanded={expanded}
        >
          {expanded ? 'Hide Project & Report Details' : 'Review / Edit Project & Report Details'}
        </SecondaryButton>
      ) : null}

      {expanded ? (
        <div
          style={{ marginTop: 16 }}
          onChange={() => {
            if (editingReportId && detailsTouchedRef) detailsTouchedRef.current = true
          }}
        >
          {loading ? (
            <p style={{ color: 'var(--text-2)', fontSize: 16, margin: '0 0 12px' }}>Loading…</p>
          ) : null}
          {!loading ? (
          <>
          {error ? (
            <div
              role="alert"
              style={{
                background: 'rgba(220,50,50,0.1)',
                border: '1px solid rgba(220,50,50,0.3)',
                color: '#ff6b6b',
                padding: '12px 14px',
                fontSize: 14,
                marginBottom: 16,
                borderRadius: 10,
                lineHeight: 1.45,
              }}
            >
              {error}
            </div>
          ) : null}
          <SiteDiaryProjectDetailsSection {...sectionProps} />
          <PrimaryCTA
            type="button"
            onClick={onSaveProjectDetails}
            disabled={saving}
            style={{ minHeight: 52, fontSize: 16, marginTop: 8, marginBottom: 4 }}
          >
            {saving ? 'Saving project details…' : 'Save Project & Report Details'}
          </PrimaryCTA>
          </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
