'use client'

import Link from 'next/link'
import { REPORT_THEMES } from '@/lib/report-theme'

export const DIARY_ACCENT = REPORT_THEMES.diary.accent
/** Brand chrome accent (Forge Orange) — not a report-type colour; CTAs use powder-coat --rust */
export const BRAND_ACCENT = '255,80,0'
export const CTA_ORANGE = 'var(--action)'
/** Powder-coat CTA base — landing “Start Trial” uses --rust enamel */
export const CTA_POWDER = 'var(--rust)'

/* ── Typography tokens (Barlow via body; Space Grotesk reserved for brand moments) ── */
export const typeTokens = {
  wordmark: {
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.06em',
    lineHeight: 1.2,
    color: 'var(--text)',
  },
  moduleTitle: {
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: '0.04em',
    lineHeight: 1.3,
    color: 'color-mix(in srgb, var(--text) 78%, var(--text-2))',
  },
  reportName: {
    fontSize: 19,
    fontWeight: 600,
    letterSpacing: '0.01em',
    lineHeight: 1.25,
    color: 'var(--text)',
  },
  meta: {
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.45,
    color: 'color-mix(in srgb, var(--text) 72%, var(--text-2))',
  },
  sectionTitle: {
    fontWeight: 600,
    fontSize: 14,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text)',
  },
  label: {
    fontSize: 12,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    fontWeight: 500,
    color: 'color-mix(in srgb, var(--text) 70%, var(--text-2))',
  },
  body: {
    fontSize: 15,
    fontWeight: 400,
    lineHeight: 1.55,
    color: 'var(--text)',
  },
  helper: {
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.45,
    color: 'color-mix(in srgb, var(--text) 68%, var(--text-2))',
  },
}


export const pageBackground = {
  minHeight: '100vh',
  color: 'var(--text)',
  fontFamily: 'var(--font-barlow), system-ui, sans-serif',
  backgroundColor: 'var(--ink)',
  backgroundImage: `
    radial-gradient(ellipse 78% 58% at 50% 44%, color-mix(in srgb, var(--text-2) 9%, transparent) 0%, transparent 70%),
    radial-gradient(ellipse 95% 72% at 50% 108%, color-mix(in srgb, var(--text-2) 5.5%, transparent) 0%, transparent 52%),
    linear-gradient(180deg, color-mix(in srgb, var(--text-2) 3.5%, transparent) 0%, transparent 38%, color-mix(in srgb, var(--text-2) 2.5%, transparent) 100%),
    linear-gradient(172deg, var(--ink) 0%, var(--plate) 38%, var(--plate) 68%, var(--plate) 100%)
  `,
}

const POWDER_CTA_NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export const premiumScopedCss = `
  .dashboard-premium-bg { position: relative; }
  .dashboard-premium-bg::before {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    opacity: 0.03;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.78' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 128px 128px;
  }
  .dashboard-premium-bg > * { position: relative; z-index: 1; }
  .premium-back-btn__arrow {
    font-size: 20px;
    line-height: 1;
    font-weight: 600;
  }
  .zlog-primary-cta {
    position: relative;
    overflow: hidden;
    isolation: isolate;
  }
  .zlog-primary-cta:not(:disabled):hover {
    filter: brightness(1.04);
  }
  .zlog-primary-cta:not(:disabled):active {
    filter: brightness(0.96);
    transform: translateY(1px);
  }
  .zlog-secondary-btn:not(:disabled):hover {
    border-color: color-mix(in srgb, var(--text) 28%, transparent);
    background: color-mix(in srgb, var(--plate), var(--text) 4%);
  }
  .zlog-secondary-btn:not(:disabled):active {
    transform: translateY(1px);
    filter: brightness(0.96);
  }
  .zlog-header-utility-card:not(:disabled):hover {
    border-color: color-mix(in srgb, var(--edge) 100%, var(--text) 12%);
    filter: brightness(1.06);
  }
  .zlog-header-utility-card:not(:disabled):active {
    transform: translateY(1px);
    filter: brightness(0.97);
  }
  .zlog-destructive-btn:not(:disabled):hover {
    filter: brightness(1.08);
  }
  .dashboard-premium-bg input::placeholder,
  .dashboard-premium-bg textarea::placeholder,
  .dashboard-premium-bg select:invalid {
    color: color-mix(in srgb, var(--text) 48%, var(--text-dim));
    opacity: 1;
  }
`

export const labelStyle = {
  display: 'block',
  ...typeTokens.label,
  marginBottom: 8,
}

export const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  background: 'var(--plate)',
  border: '1px solid var(--edge)',
  borderRadius: '10px',
  color: 'var(--text)',
  fontSize: 15,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  marginBottom: 16,
}

export const textareaStyle = {
  ...inputStyle,
  resize: 'vertical',
  minHeight: 96,
  lineHeight: 1.55,
}

/** Powder-coated plate surface — shared by report cards / home cards */
export const glassPanelStyle = {
  background: 'var(--plate)',
  border: '1px solid var(--edge)',
  borderRadius: '16px',
  padding: '22px',
  boxShadow:
    '0 8px 32px color-mix(in srgb, var(--ink) 40%, transparent), inset 0 1px 0 var(--edge-highlight)',
  marginBottom: 16,
}

export const sectionTitleStyle = {
  ...typeTokens.sectionTitle,
  marginBottom: 16,
}

/**
 * Locked Zlog industrial powder-coat design tokens.
 * Report-card top accents stay thin; history/list category rails use the thicker mobile-visible strip.
 */
export const MODULE_ACCENT_THICKNESS = 2.5
/** History / item listing left rail — locked mobile-visible powder-coat strip */
export const CATEGORY_RAIL_THICKNESS = 5.5

/** Module-coloured top-edge highlight (dashboard card language) */
export function ModuleAccent({
  accent = DIARY_ACCENT,
  height = `${MODULE_ACCENT_THICKNESS}px`,
  radius = '16px 16px 0 0',
}) {
  return (
    <div
      className="premium-accent-bar premium-dash-accent"
      style={accentBarStyle(accent, height, radius)}
      aria-hidden
    />
  )
}

export const accentBarStyle = (accent, height = `${MODULE_ACCENT_THICKNESS}px`, radius = '16px 16px 0 0') => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height,
  background: `linear-gradient(90deg, transparent 0%, rgba(${accent}, 0.95) 22%, color-mix(in srgb, var(--text) 55%, transparent) 50%, rgba(${accent}, 0.95) 78%, transparent 100%)`,
  boxShadow: `0 0 12px rgba(${accent}, 0.32), 0 2px 6px rgba(${accent}, 0.2)`,
  pointerEvents: 'none',
  borderRadius: radius,
})

/**
 * Vertical category rail for history / list cards (Survey / Diary / Progress / Snag / H&S).
 * Locked at CATEGORY_RAIL_THICKNESS (5.5px): deep module colour → pale specular → soft falloff.
 */
export const categoryRailStyle = (
  accent,
  width = CATEGORY_RAIL_THICKNESS,
  radius = '12px 0 0 12px',
) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  bottom: 0,
  width,
  borderRadius: radius,
  pointerEvents: 'none',
  background: `linear-gradient(180deg, transparent 0%, rgba(${accent}, 0.88) 18%, color-mix(in srgb, var(--text) 52%, transparent) 50%, rgba(${accent}, 0.88) 82%, transparent 100%)`,
  boxShadow: `inset 1px 0 0 color-mix(in srgb, var(--text) 22%, transparent), 1px 0 5px rgba(${accent}, 0.16)`,
})

export function ModuleCategoryRail({
  accent = DIARY_ACCENT,
  width = CATEGORY_RAIL_THICKNESS,
  radius = '12px 0 0 12px',
}) {
  return (
    <div
      className="premium-category-rail"
      style={categoryRailStyle(accent, width, radius)}
      aria-hidden
    />
  )
}

/**
 * Powder-coated primary CTA — visual match to landing “Start 7-Day Free Trial”.
 * Uses --rust enamel (darker base, top highlight, depth, soft glow) — not flat fluorescent orange.
 */
export function primaryButtonStyle(_accent = DIARY_ACCENT, disabled = false) {
  return {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
    minHeight: 48,
    padding: '14px 18px',
    borderRadius: '12px',
    border: '1px solid color-mix(in srgb, var(--rust), var(--ink) 58%)',
    background:
      'linear-gradient(180deg, color-mix(in srgb, var(--rust), var(--text) 16%) 0%, color-mix(in srgb, var(--rust), var(--text) 6%) 18%, var(--rust) 42%, var(--rust) 62%, color-mix(in srgb, var(--rust), var(--ink) 29%) 88%, color-mix(in srgb, var(--rust), var(--ink) 45%) 100%)',
    boxShadow:
      'inset 0 1px 0 color-mix(in srgb, var(--text), transparent 75%), inset 0 16px 28px color-mix(in srgb, var(--text), transparent 94%), inset 0 -14px 20px color-mix(in srgb, var(--ink), transparent 48%), 0 0 22px color-mix(in srgb, var(--rust), transparent 75%)',
    color: 'var(--text)',
    fontWeight: 600,
    fontSize: 15,
    fontFamily: 'inherit',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    boxSizing: 'border-box',
  }
}

export function PrimaryCTA({
  children,
  disabled = false,
  type = 'button',
  onClick,
  style,
  className = '',
  accent,
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`zlog-primary-cta premium-primary-btn ${className}`.trim()}
      style={{ ...primaryButtonStyle(accent, disabled), ...style }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: '46%',
          pointerEvents: 'none',
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--text), transparent 90%) 0%, color-mix(in srgb, var(--text), transparent 97%) 55%, transparent 100%)',
        }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: 0.12,
          mixBlendMode: 'soft-light',
          backgroundImage: POWDER_CTA_NOISE,
          backgroundSize: '160px 160px',
        }}
      />
      <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
    </button>
  )
}

export function secondaryButtonStyle(disabled = false) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    padding: '10px 16px',
    background: 'var(--plate)',
    border: '1px solid var(--edge)',
    borderRadius: '12px',
    color: 'var(--text)',
    fontWeight: 500,
    fontSize: 14,
    fontFamily: 'inherit',
    letterSpacing: '0.02em',
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    lineHeight: 1.2,
    textDecoration: 'none',
    boxSizing: 'border-box',
    boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
  }
}

export function SecondaryButton({
  children,
  disabled = false,
  type = 'button',
  onClick,
  href,
  style,
  className = '',
}) {
  const merged = {
    ...secondaryButtonStyle(disabled),
    ...style,
  }
  if (href) {
    return (
      <Link href={href} className={`zlog-secondary-btn ${className}`.trim()} style={merged} onClick={onClick}>
        {children}
      </Link>
    )
  }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`zlog-secondary-btn ${className}`.trim()}
      style={merged}
    >
      {children}
    </button>
  )
}

export function destructiveButtonStyle(disabled = false) {
  return {
    ...secondaryButtonStyle(disabled),
    background: 'color-mix(in srgb, var(--danger) 14%, var(--plate))',
    border: '1px solid color-mix(in srgb, var(--danger) 45%, transparent)',
    color: 'color-mix(in srgb, var(--danger) 70%, var(--text))',
  }
}

export function DestructiveButton({
  children,
  disabled = false,
  type = 'button',
  onClick,
  style,
  className = '',
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`zlog-destructive-btn ${className}`.trim()}
      style={{ ...destructiveButtonStyle(disabled), ...style }}
    >
      {children}
    </button>
  )
}

export function ghostButtonStyle() {
  return {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-2)',
    fontSize: 22,
    cursor: 'pointer',
    padding: '8px 12px',
    lineHeight: 1,
    minWidth: 44,
    minHeight: 44,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
}

export function premiumBackPillStyle() {
  return {
    ...secondaryButtonStyle(false),
    borderRadius: 999,
    padding: '8px 16px',
    flexShrink: 0,
  }
}

/** Subtle Zlog wordmark — orange “Z” (matches riveted Z), warm white “log” */
export function ZlogWordmark({ style } = {}) {
  return (
    <div
      aria-label="Zlog"
      style={{
        ...typeTokens.wordmark,
        color: 'var(--text)',
        ...style,
      }}
    >
      <span style={{ color: 'var(--rust)' }}>Z</span>
      <span style={{ color: 'var(--text)' }}>log</span>
    </div>
  )
}

export function PremiumBackButton({ onClick, href, label = 'Back' }) {
  const style = {
    ...premiumBackPillStyle(),
    position: 'relative',
    zIndex: 50,
    pointerEvents: 'auto',
    touchAction: 'manipulation',
    textDecoration: 'none',
  }
  const content = (
    <>
      <span className="premium-back-btn__arrow" aria-hidden>
        ←
      </span>
      <span>{label}</span>
    </>
  )
  if (href) {
    return (
      <Link
        href={href}
        className="premium-back-btn zlog-secondary-btn"
        style={style}
        aria-label={`Go ${label.toLowerCase()}`}
        onClick={onClick}
      >
        {content}
      </Link>
    )
  }
  return (
    <button
      type="button"
      className="premium-back-btn zlog-secondary-btn"
      onClick={onClick}
      style={style}
      aria-label={`Go ${label.toLowerCase()}`}
    >
      {content}
    </button>
  )
}

/**
 * Branded internal page header — Back + Zlog identity + module/report hierarchy.
 * Props:
 *   title       — module title (e.g. "Site Diary Report")
 *   reportName  — prominent project / report name (~19px)
 *   meta        — client · location (muted)
 *   subtitle    — legacy alias for reportName when reportName omitted
 */
export function ZlogInternalHeader({
  title,
  reportName,
  meta,
  subtitle,
  onBack,
  backHref,
  accent = DIARY_ACCENT,
  trailing = null,
}) {
  const name = reportName || subtitle || ''
  const metaLine = meta || ''

  return (
    <header
      className="premium-shell-header zlog-internal-header"
      style={{
        position: 'relative',
        zIndex: 50,
        background: 'color-mix(in srgb, var(--ink) 72%, var(--plate))',
        borderBottom: '1px solid var(--edge-highlight)',
        padding: '14px 24px 16px',
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}
    >
      <ModuleAccent accent={accent} height="3px" radius="0" />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative' }}>
        {(backHref || onBack) && <PremiumBackButton href={backHref} onClick={onBack} />}
        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <ZlogWordmark style={{ marginBottom: 6, opacity: 0.92 }} />
          {title ? <div style={{ ...typeTokens.moduleTitle, marginBottom: name ? 4 : 0 }}>{title}</div> : null}
          {name ? <div style={{ ...typeTokens.reportName, marginBottom: metaLine ? 4 : 0 }}>{name}</div> : null}
          {metaLine ? <div className="premium-shell-subtitle" style={typeTokens.meta}>{metaLine}</div> : null}
        </div>
        {trailing}
      </div>
    </header>
  )
}

export function PremiumShell({
  title,
  reportName,
  meta,
  subtitle,
  onBack,
  backHref,
  accent = DIARY_ACCENT,
  children,
  maxWidth = 640,
  trailing = null,
}) {
  return (
    <div className="dashboard-premium-bg" style={pageBackground}>
      <style>{premiumScopedCss}</style>
      <ZlogInternalHeader
        title={title}
        reportName={reportName}
        meta={meta}
        subtitle={subtitle}
        onBack={onBack}
        backHref={backHref}
        accent={accent}
        trailing={trailing}
      />
      <div style={{ position: 'relative', zIndex: 1, padding: '20px 24px 32px', maxWidth, margin: '0 auto' }}>
        {children}
      </div>
    </div>
  )
}

/** Report editor section card — powder-coat plate + module top accent */
export function ReportSectionCard({ title, accent = DIARY_ACCENT, children, style }) {
  return (
    <section
      className="premium-glass-panel zlog-report-section"
      style={{ ...glassPanelStyle, position: 'relative', overflow: 'hidden', ...style }}
    >
      <ModuleAccent accent={accent} />
      {title && (
        <h2 className="premium-section-title" style={{ ...sectionTitleStyle, marginTop: 4 }}>
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}

/** Alias — existing call sites */
export function GlassSection(props) {
  return <ReportSectionCard {...props} />
}

/** Module home / action card (New Report, dashboard modules, etc.) */
export function ModuleHomeCard({
  title,
  description,
  icon,
  accent = DIARY_ACCENT,
  onClick,
  disabled = false,
  style,
  children,
}) {
  return (
    <button
      type="button"
      className="premium-dash-card"
      disabled={disabled}
      onClick={onClick}
      style={{
        ...dashboardCardStyle,
        '--accent': accent,
        ...(disabled ? { cursor: 'default', opacity: 0.45 } : {}),
        ...style,
      }}
    >
      <ModuleAccent accent={accent} />
      {icon != null && (
        <div className="premium-dash-icon" style={{ ...dashboardIconBoxStyle(accent), '--accent': accent }}>
          {icon}
        </div>
      )}
      {title && (
        <div className="premium-dash-card-title" style={dashboardCardTitleStyle}>
          {title}
        </div>
      )}
      {description && (
        <div className="premium-dash-card-desc" style={dashboardCardDescStyle}>
          {description}
        </div>
      )}
      {children}
    </button>
  )
}

/** Neutral recent-entry / history card with luminous module category rail */
export function RecentEntryCard({ accent = DIARY_ACCENT, children, style }) {
  return (
    <div
      className="premium-recent-entry-card"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--plate)',
        border: '1px solid var(--edge)',
        borderRadius: '12px',
        padding: '16px 16px 16px 18px',
        marginBottom: 12,
        boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <ModuleCategoryRail accent={accent} />
      <div
        className="premium-recent-entry-card__body"
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          paddingLeft: 4,
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** Shared diary-history entry typography / action geometry (16px body, 48px actions) */
export const recentEntryDateStyle = {
  fontWeight: 700,
  fontSize: 16,
  color: 'var(--text)',
  lineHeight: 1.3,
  letterSpacing: '0.01em',
  minHeight: 21,
}

export const recentEntrySummaryStyle = {
  color: 'color-mix(in srgb, var(--text) 90%, var(--text-2))',
  fontSize: 16,
  lineHeight: 1.45,
  marginTop: 6,
  minHeight: 'calc(1.45em * 2)',
}

export const recentEntryActionsStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  marginTop: 14,
}

export const recentEntryActionButtonStyle = {
  minHeight: 48,
  fontSize: 16,
  fontWeight: 600,
  padding: '12px 16px',
  boxSizing: 'border-box',
}

export const premiumDiaryEmptyClass = 'premium-diary-empty'
export const premiumDiaryEmptyTitleClass = 'premium-diary-empty__title'
export const premiumDiaryEmptyHintClass = 'premium-diary-empty__hint'

export const dashboardCardStyle = {
  position: 'relative',
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  padding: '11px 8px 9px',
  background: 'var(--plate)',
  borderRadius: '16px',
  cursor: 'pointer',
  textAlign: 'left',
  overflow: 'hidden',
  fontFamily: 'inherit',
  color: 'var(--text)',
  border: '1px solid var(--edge)',
  boxShadow:
    '0 8px 32px color-mix(in srgb, var(--ink) 42%, transparent), inset 0 1px 0 var(--edge-highlight)',
}

export const dashboardCardTitleStyle = {
  fontWeight: 700,
  fontSize: '15px',
  color: 'var(--text)',
  marginBottom: '4px',
  lineHeight: 1.2,
}

export const dashboardCardDescStyle = {
  fontSize: '16px',
  color: 'color-mix(in srgb, var(--text) 92%, var(--text-2))',
  lineHeight: 1.28,
  margin: 0,
  width: '100%',
  minHeight: 'calc(1.28em * 3)',
  maxHeight: 'none',
  display: 'block',
  overflow: 'visible',
  textOverflow: 'clip',
  WebkitLineClamp: 'unset',
  whiteSpace: 'normal',
  overflowWrap: 'break-word',
  wordBreak: 'normal',
  flex: '1 1 auto',
}

export const dashboardIconBoxStyle = (accent) => ({
  width: '38px',
  height: '38px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '12px',
  marginBottom: '6px',
  flexShrink: 0,
  fontSize: '20px',
  lineHeight: 1,
  background: `linear-gradient(145deg, rgba(${accent}, 0.24) 0%, rgba(${accent}, 0.1) 100%)`,
  border: `1px solid rgba(${accent}, 0.32)`,
  boxShadow: `inset 0 1px 0 var(--edge-highlight), 0 4px 18px rgba(${accent}, 0.2)`,
})

/** Card hover / stagger — pair with premiumScopedCss on dashboard pages */
export const dashboardCardInteractionCss = `
  .premium-dash-card-wrap {
    opacity: 0;
    animation: dash-card-enter 400ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
    align-self: stretch;
  }
  @keyframes dash-card-enter {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .premium-dash-card {
    transition: all 220ms cubic-bezier(0.22, 1, 0.36, 1);
    border: 1px solid var(--edge);
    box-shadow: 0 8px 32px color-mix(in srgb, var(--ink) 42%, transparent), inset 0 1px 0 var(--edge-highlight);
  }
  .premium-dash-accent,
  .premium-dash-icon {
    transition: all 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .premium-dash-card-wrap:hover .premium-dash-card {
    transform: translateY(-6px) scale(1.015);
    filter: brightness(1.06);
    border-color: rgba(var(--accent), 0.48);
    box-shadow:
      0 24px 64px color-mix(in srgb, var(--ink) 54%, transparent),
      0 0 52px rgba(var(--accent), 0.32),
      0 0 2px rgba(var(--accent), 0.55),
      inset 0 1px 0 var(--edge-highlight);
  }
  .premium-dash-card-wrap:hover .premium-dash-accent { filter: brightness(1.2); }
  .premium-dash-card-wrap:hover .premium-dash-icon { filter: brightness(1.15); }
  .premium-dash-card-wrap .premium-dash-card:active {
    transform: scale(0.985);
    transition-duration: 120ms;
    box-shadow: 0 4px 20px color-mix(in srgb, var(--ink) 32%, transparent), inset 0 1px 0 var(--edge-highlight);
  }
  .premium-dash-card-wrap:hover .premium-dash-card:active {
    transform: translateY(-6px) scale(0.985);
    filter: brightness(1.04);
    border-color: rgba(var(--accent), 0.38);
    box-shadow:
      0 18px 48px color-mix(in srgb, var(--ink) 48%, transparent),
      0 0 32px rgba(var(--accent), 0.2),
      0 0 1px rgba(var(--accent), 0.4),
      inset 0 1px 0 var(--edge-highlight);
    transition-duration: 120ms;
  }
  .premium-dash-cards-grid {
    --dash-gap: 14px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--dash-gap);
    align-items: stretch;
  }
  .premium-dash-cards-grid > .premium-dash-card-wrap {
    display: flex;
    grid-column: span 2;
    height: 100%;
    min-width: 0;
    min-height: 100%;
    margin: 0;
    padding: 0;
  }
  .premium-dash-cards-grid > .premium-dash-card-wrap > .premium-dash-card {
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-height: 100%;
    box-sizing: border-box;
  }
  .premium-dash-cards-grid > .premium-dash-card-wrap--hs {
    grid-column: 2 / 4;
    justify-self: stretch;
    width: auto;
    max-width: none;
  }

  @media (max-width: 768px) {
    .premium-dash-cards-grid {
      --dash-gap: 12px;
    }

    .premium-dash-cards-grid > .premium-dash-card-wrap > .premium-dash-card {
      padding: 11px 8px 9px !important;
      min-height: 0 !important;
    }

    .premium-dash-card {
      background: var(--plate) !important;
      border: 1px solid var(--edge) !important;
      box-shadow: 0 8px 32px color-mix(in srgb, var(--ink) 42%, transparent), inset 0 1px 0 var(--edge-highlight) !important;
    }

    .premium-dash-card-title {
      color: var(--text) !important;
      font-size: 15px !important;
      font-weight: 700 !important;
      line-height: 1.2 !important;
      margin-bottom: 4px !important;
    }

    .premium-dash-card-desc {
      color: color-mix(in srgb, var(--text) 92%, var(--text-2)) !important;
      font-size: 16px !important;
      line-height: 1.28 !important;
      min-height: calc(1.28em * 3) !important;
      max-height: none !important;
      display: block !important;
      -webkit-line-clamp: unset !important;
      line-clamp: unset !important;
      text-overflow: clip !important;
      overflow: visible !important;
      white-space: normal !important;
    }

    .premium-dash-icon {
      margin-bottom: 6px !important;
      width: 38px !important;
      height: 38px !important;
      font-size: 20px !important;
      filter: brightness(1.1);
      box-shadow: inset 0 1px 0 var(--edge-highlight), 0 4px 22px rgba(var(--accent), 0.26) !important;
      border-color: rgba(var(--accent), 0.38) !important;
    }

    .premium-dash-accent {
      height: var(--module-accent-thickness, 2.5px) !important;
      transition: filter 100ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 100ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    .premium-dash-card-wrap:active .premium-dash-card {
      transform: translateY(-5px) scale(1.01) !important;
      transition-duration: 100ms;
      filter: brightness(1.05);
      border-color: rgba(var(--accent), 0.62) !important;
      box-shadow:
        0 20px 52px color-mix(in srgb, var(--ink) 50%, transparent),
        0 0 44px rgba(var(--accent), 0.38),
        0 0 3px rgba(var(--accent), 0.62),
        inset 0 1px 0 var(--edge-highlight) !important;
    }

    .premium-dash-card-wrap:active .premium-dash-accent {
      filter: brightness(1.38);
      box-shadow: 0 0 18px rgba(var(--accent), 0.58), 0 2px 10px rgba(var(--accent), 0.42);
    }

    .premium-dash-card-wrap:active .premium-dash-icon {
      filter: brightness(1.22);
      box-shadow: inset 0 1px 0 var(--edge-highlight), 0 4px 26px rgba(var(--accent), 0.34) !important;
    }

    .premium-dash-card-wrap .premium-dash-card:active,
    .premium-dash-card-wrap:hover .premium-dash-card:active {
      transform: translateY(-5px) scale(1.01) !important;
      transition-duration: 100ms;
      filter: brightness(1.05);
      border-color: rgba(var(--accent), 0.62) !important;
      box-shadow:
        0 20px 52px color-mix(in srgb, var(--ink) 50%, transparent),
        0 0 44px rgba(var(--accent), 0.38),
        0 0 3px rgba(var(--accent), 0.62),
        inset 0 1px 0 var(--edge-highlight) !important;
    }

    .premium-back-btn__arrow {
      font-size: 22px;
    }
  }
`
