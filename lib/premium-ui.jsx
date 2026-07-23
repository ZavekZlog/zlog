'use client'

import Link from 'next/link'
import { REPORT_THEMES } from '@/lib/report-theme'

export const DIARY_ACCENT = REPORT_THEMES.diary.accent
export const CTA_ORANGE = 'var(--action)'

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
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.04em',
    lineHeight: 1.3,
    color: 'var(--text-2)',
  },
  reportName: {
    fontSize: 19,
    fontWeight: 600,
    letterSpacing: '0.01em',
    lineHeight: 1.25,
    color: 'var(--text)',
  },
  meta: {
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 1.4,
    color: 'var(--text-2)',
  },
  sectionTitle: {
    fontWeight: 600,
    fontSize: 13,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text)',
  },
  label: {
    fontSize: 11,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    fontWeight: 500,
    color: 'var(--text-2)',
  },
  body: {
    fontSize: 15,
    fontWeight: 400,
    lineHeight: 1.55,
    color: 'var(--text)',
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
  .zlog-destructive-btn:not(:disabled):hover {
    filter: brightness(1.08);
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

/** Module-coloured top-edge highlight (dashboard card language) */
export function ModuleAccent({ accent = DIARY_ACCENT, height = '2.55px', radius = '16px 16px 0 0' }) {
  return (
    <div
      className="premium-accent-bar premium-dash-accent"
      style={accentBarStyle(accent, height, radius)}
      aria-hidden
    />
  )
}

export const accentBarStyle = (accent, height = '2.55px', radius = '16px 16px 0 0') => ({
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
 * Powder-coated primary CTA — landing-page material language on --action (Forge Orange).
 * Soft depth + top highlight + outer glow; not flat fluorescent fill.
 */
export function primaryButtonStyle(_accent = DIARY_ACCENT, disabled = false) {
  return {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
    minHeight: 48,
    padding: '14px 18px',
    borderRadius: '12px',
    border: '1px solid color-mix(in srgb, var(--action), var(--ink) 58%)',
    background:
      'linear-gradient(180deg, color-mix(in srgb, var(--action), var(--text) 16%) 0%, color-mix(in srgb, var(--action), var(--text) 6%) 18%, var(--action) 42%, var(--action) 62%, color-mix(in srgb, var(--action), var(--ink) 29%) 88%, color-mix(in srgb, var(--action), var(--ink) 45%) 100%)',
    boxShadow:
      'inset 0 1px 0 color-mix(in srgb, var(--text), transparent 75%), inset 0 16px 28px color-mix(in srgb, var(--text), transparent 94%), inset 0 -14px 20px color-mix(in srgb, var(--ink), transparent 48%), 0 0 22px color-mix(in srgb, var(--action), transparent 75%)',
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

/** Subtle Zlog wordmark — warm white + orange “log” */
export function ZlogWordmark({ style } = {}) {
  return (
    <div
      aria-label="Zlog"
      style={{
        ...typeTokens.wordmark,
        ...style,
      }}
    >
      Z<span style={{ color: 'var(--action)' }}>log</span>
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

/** Neutral recent-entry card with optional subtle module edge */
export function RecentEntryCard({ accent = DIARY_ACCENT, children, style }) {
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--plate)',
        border: '1px solid var(--edge)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '12px',
        boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
        ...style,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: 3,
          background: `rgba(${accent}, 0.55)`,
          borderRadius: '12px 0 0 12px',
        }}
      />
      <div style={{ paddingLeft: 6 }}>{children}</div>
    </div>
  )
}

export const premiumDiaryEmptyClass = 'premium-diary-empty'
export const premiumDiaryEmptyTitleClass = 'premium-diary-empty__title'
export const premiumDiaryEmptyHintClass = 'premium-diary-empty__hint'

export const dashboardCardStyle = {
  position: 'relative',
  width: '100%',
  padding: '28px',
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
  fontSize: '16px',
  color: 'var(--text)',
  marginBottom: '10px',
  lineHeight: 1.35,
}

export const dashboardCardDescStyle = {
  fontSize: '13px',
  color: 'var(--text-2)',
  lineHeight: 1.6,
  margin: 0,
}

export const dashboardIconBoxStyle = (accent) => ({
  width: '52px',
  height: '52px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '12px',
  marginBottom: '22px',
  fontSize: '28px',
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
  }
  @keyframes dash-card-enter {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
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
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .premium-dash-cards-grid > .premium-dash-card-wrap,
  .premium-dash-card-wrap--solo { display: flex; }
  .premium-dash-cards-grid > .premium-dash-card-wrap > .premium-dash-card,
  .premium-dash-card-wrap--solo > .premium-dash-card {
    flex: 1;
    width: 100%;
    min-height: 188px;
  }

  @media (max-width: 768px) {
    .premium-dash-cards-grid > .premium-dash-card-wrap > .premium-dash-card,
    .premium-dash-card-wrap--solo > .premium-dash-card {
      min-height: 174px;
      padding: 22px !important;
    }

    .premium-dash-card {
      background: var(--plate) !important;
      border: 1px solid var(--edge) !important;
      box-shadow: 0 8px 32px color-mix(in srgb, var(--ink) 42%, transparent), inset 0 1px 0 var(--edge-highlight) !important;
    }

    .premium-dash-card-title {
      color: var(--text) !important;
      font-size: 17px !important;
      font-weight: 700 !important;
      line-height: 1.32 !important;
      margin-bottom: 8px !important;
    }

    .premium-dash-card-desc {
      color: var(--text-2) !important;
      font-size: 14px !important;
      line-height: 1.55 !important;
    }

    .premium-dash-icon {
      margin-bottom: 14px !important;
      filter: brightness(1.1);
      box-shadow: inset 0 1px 0 var(--edge-highlight), 0 4px 22px rgba(var(--accent), 0.26) !important;
      border-color: rgba(var(--accent), 0.38) !important;
    }

    .premium-dash-accent {
      height: 5px !important;
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
