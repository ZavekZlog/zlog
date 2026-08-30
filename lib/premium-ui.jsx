'use client'

import Link from 'next/link'
import { ArrowLeft, LogOut } from 'lucide-react'
import { REPORT_THEMES } from '@/lib/report-theme'

export const DIARY_ACCENT = REPORT_THEMES.diary.accent
/** Brand chrome accent (Forge Orange) — not a report-type colour; CTAs use powder-coat --rust */
export const BRAND_ACCENT = '255,80,0'
export const CTA_ORANGE = 'var(--action)'
/** Powder-coat PrimaryCTA base — approved construction/enamel orange (#DB3D06). */
export const ZLOG_POWDER_CTA_ORANGE = '#DB3D06'
export const CTA_POWDER = ZLOG_POWDER_CTA_ORANGE

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
  /* Opt-in compact Back for long report screens (SubPageLayout stickyBack).
     Sticks flush to the scrollport and carries its inset as its own opaque
     padding: a non-zero top offset leaves a live strip that scrolling content
     shows through. The negative margin cancels the padding, so the surrounding
     flow position is unchanged. */
  .zlog-sticky-back-dock {
    position: sticky;
    top: 0;
    z-index: 60;
    isolation: isolate;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    margin: -12px 0 12px;
    padding: 12px 0 8px;
    background: #0b0d12;
  }
  /* Workbench shells (PremiumShell default): tighter sticky Back dock for long records. */
  .zlog-workbench-shell .zlog-sticky-back-dock {
    margin: -8px 0 6px;
    padding: 6px 0 4px;
  }
  .zlog-workbench-shell .zlog-module-page-header {
    margin-bottom: 16px;
  }
  /* Cancels the globals.css 1px .premium-shell-header hairline on workbench pages. */
  .zlog-workbench-shell .premium-shell-header,
  .zlog-workbench-shell .zlog-internal-header {
    border-bottom: none !important;
  }
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
  .zlog-equal-choice-btn {
    transition:
      border-color 180ms cubic-bezier(0.22, 1, 0.36, 1),
      background 180ms cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1),
      filter 180ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 120ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .zlog-equal-choice-btn:not(:disabled):hover {
    border-color: color-mix(in srgb, var(--rust) 38%, var(--edge));
    background: color-mix(in srgb, var(--plate), var(--text) 14%);
    box-shadow:
      inset 0 1px 0 var(--edge-highlight),
      0 0 0 1px color-mix(in srgb, var(--rust) 18%, transparent),
      0 0 16px color-mix(in srgb, var(--rust) 16%, transparent);
  }
  .zlog-equal-choice-btn:not(:disabled):active {
    transform: translateY(1px);
    filter: brightness(0.97);
    box-shadow:
      inset 0 1px 0 var(--edge-highlight),
      0 0 0 1px color-mix(in srgb, var(--rust) 12%, transparent),
      0 0 10px color-mix(in srgb, var(--rust) 10%, transparent);
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
 * ONE canonical accent thickness for horizontal report accents AND vertical history rails.
 */
export const MODULE_ACCENT_THICKNESS = 2.5
/** Vertical history/list rails — same token as ModuleAccent (never diverge) */
export const CATEGORY_RAIL_THICKNESS = MODULE_ACCENT_THICKNESS

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
  boxSizing: 'border-box',
  border: 'none',
  background: `linear-gradient(90deg, transparent 0%, rgba(${accent}, 0.95) 22%, color-mix(in srgb, var(--text) 55%, transparent) 50%, rgba(${accent}, 0.95) 78%, transparent 100%)`,
  boxShadow: `0 0 12px rgba(${accent}, 0.32), 0 2px 6px rgba(${accent}, 0.2)`,
  pointerEvents: 'none',
  borderRadius: radius,
})

/**
 * Vertical category rail — crisp solid strip at MODULE_ACCENT_THICKNESS.
 * No radius/shadow/filter: radius ≫ width was antialiasing into a fat soft bloom.
 * Parent .premium-recent-entry-card (overflow:hidden + radius) clips corners.
 */
export const categoryRailStyle = (
  accent,
  width = `${MODULE_ACCENT_THICKNESS}px`,
) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  bottom: 0,
  width,
  minWidth: width,
  maxWidth: width,
  boxSizing: 'border-box',
  margin: 0,
  padding: 0,
  border: 'none',
  borderRadius: 0,
  outline: 'none',
  pointerEvents: 'none',
  filter: 'none',
  transform: 'none',
  boxShadow: 'none',
  background: `rgba(${accent}, 0.95)`,
})

export function ModuleCategoryRail({
  accent = DIARY_ACCENT,
  width = `${MODULE_ACCENT_THICKNESS}px`,
}) {
  return (
    <div
      className="premium-category-rail"
      style={categoryRailStyle(accent, width)}
      aria-hidden
    />
  )
}

/**
 * LOCKED landing primary CTA surface — single source of truth for all orange powder-coat CTAs.
 * Matches landing “Start 7-Day Free Trial” exactly (--rust enamel, highlight, depth, glow).
 * Do not approximate; always render via PrimaryCTA.
 */
export const POWDER_CTA_BORDER = `1px solid color-mix(in srgb, ${ZLOG_POWDER_CTA_ORANGE}, var(--ink) 58%)`
export const POWDER_CTA_BACKGROUND =
  `linear-gradient(180deg, color-mix(in srgb, ${ZLOG_POWDER_CTA_ORANGE}, var(--text) 16%) 0%, color-mix(in srgb, ${ZLOG_POWDER_CTA_ORANGE}, var(--text) 6%) 18%, ${ZLOG_POWDER_CTA_ORANGE} 42%, ${ZLOG_POWDER_CTA_ORANGE} 62%, color-mix(in srgb, ${ZLOG_POWDER_CTA_ORANGE}, var(--ink) 29%) 88%, color-mix(in srgb, ${ZLOG_POWDER_CTA_ORANGE}, var(--ink) 45%) 100%)`
export const POWDER_CTA_SHADOW =
  `inset 0 1px 0 color-mix(in srgb, var(--text), transparent 75%), inset 0 16px 28px color-mix(in srgb, var(--text), transparent 94%), inset 0 -14px 20px color-mix(in srgb, var(--ink), transparent 48%), 0 0 22px color-mix(in srgb, ${ZLOG_POWDER_CTA_ORANGE}, transparent 75%)`
export const POWDER_CTA_HIGHLIGHT =
  'linear-gradient(180deg, color-mix(in srgb, var(--text), transparent 90%) 0%, color-mix(in srgb, var(--text), transparent 97%) 55%, transparent 100%)'

export function primaryButtonStyle(_accent = DIARY_ACCENT, disabled = false) {
  return {
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
    minHeight: 40,
    padding: '8px 18px',
    borderRadius: '12px',
    border: POWDER_CTA_BORDER,
    background: POWDER_CTA_BACKGROUND,
    boxShadow: POWDER_CTA_SHADOW,
    color: 'var(--text)',
    fontWeight: 600,
    fontSize: 16,
    fontFamily: 'inherit',
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    boxSizing: 'border-box',
  }
}

function PowderCtaOverlays() {
  return (
    <>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: '46%',
          pointerEvents: 'none',
          background: POWDER_CTA_HIGHLIGHT,
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
    </>
  )
}

/**
 * Restrained report/workbench primary — same dark plate + rust perimeter as the
 * locked saved-diary review action. Not landing powder-coat enamel.
 */
export function workbenchPrimaryButtonStyle(disabled = false) {
  return {
    ...equalChoiceButtonStyle(disabled),
    width: '100%',
    border: `1px solid color-mix(in srgb, ${ZLOG_POWDER_CTA_ORANGE} 42%, var(--edge))`,
    boxShadow: 'inset 0 1px 0 var(--edge-highlight)',
  }
}

/**
 * @param {{
 *   children: import('react').ReactNode
 *   disabled?: boolean
 *   loading?: boolean
 *   type?: string
 *   onClick?: import('react').MouseEventHandler
 *   onPointerDown?: import('react').PointerEventHandler
 *   onKeyDown?: import('react').KeyboardEventHandler
 *   href?: string
 *   style?: import('react').CSSProperties
 *   className?: string
 *   accent?: string
 *   surface?: 'brand' | 'workbench'
 * }} props
 */
export function PrimaryCTA({
  children,
  disabled = false,
  loading = false,
  type = 'button',
  onClick,
  onPointerDown,
  onKeyDown,
  href,
  style,
  className = '',
  accent,
  surface = 'brand',
}) {
  const isWorkbench = surface === 'workbench'
  const isDisabled = Boolean(disabled || loading)
  const classNames = isWorkbench
    ? `zlog-equal-choice-btn zlog-workbench-primary-cta ${className}`.trim()
    : `zlog-primary-cta premium-primary-btn ${className}`.trim()
  const merged = {
    ...(isWorkbench ? workbenchPrimaryButtonStyle(isDisabled) : primaryButtonStyle(accent, isDisabled)),
    ...style,
  }

  const content = (
    <>
      {isWorkbench ? null : <PowderCtaOverlays />}
      <span style={{ position: 'relative', zIndex: 1, width: '100%' }}>{children}</span>
    </>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={classNames}
        data-zlog-cta-surface={surface}
        aria-busy={loading || undefined}
        style={{
          ...merged,
          textDecoration: 'none',
          display: merged.display ?? 'inline-flex',
          alignItems: merged.alignItems ?? 'center',
          justifyContent: merged.justifyContent ?? 'center',
        }}
        onClick={onClick}
        aria-disabled={isDisabled || undefined}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={classNames}
      data-zlog-cta-surface={surface}
      aria-busy={loading || undefined}
      style={merged}
    >
      {content}
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

/**
 * Strong neutral / equal-choice action — between PrimaryCTA (brand powder-coat
 * or workbench rust-framed progression) and SecondaryButton (ordinary secondary / nav).
 * Use when two or more significant routes share equal hierarchy.
 * Never solid orange fill; peers must stay visually matched.
 */
export function equalChoiceButtonStyle(disabled = false) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    padding: '12px 16px',
    background: 'color-mix(in srgb, var(--plate), var(--text) 11%)',
    border: '1px solid color-mix(in srgb, var(--edge) 42%, var(--text) 38%)',
    borderRadius: '12px',
    color: 'var(--text)',
    fontWeight: 600,
    fontSize: 15,
    fontFamily: 'inherit',
    letterSpacing: '0.015em',
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    lineHeight: 1.2,
    textDecoration: 'none',
    boxSizing: 'border-box',
    boxShadow:
      'inset 0 1px 0 var(--edge-highlight), 0 1px 4px color-mix(in srgb, var(--ink) 35%, transparent)',
  }
}

export function EqualChoiceButton({
  children,
  disabled = false,
  type = 'button',
  onClick,
  href,
  style,
  className = '',
}) {
  const merged = {
    ...equalChoiceButtonStyle(disabled),
    ...style,
  }
  const classNames = `zlog-equal-choice-btn ${className}`.trim()
  if (href) {
    return (
      <Link href={href} className={classNames} style={merged} onClick={onClick}>
        {children}
      </Link>
    )
  }
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={classNames} style={merged}>
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

/**
 * TEXT Zlog wordmark Z accent — alias of the established app-header token only.
 * Source of truth: CSS --rust (globals.css). Do not hard-code a separate hex.
 */
export const ZLOG_TEXT_WORDMARK_Z_COLOR = '#DB3D06'

/**
 * Text letters for the Zlog product wordmark.
 * Z = var(--rust) · log = warm white (--text). No glow/gradient/outline on the Z.
 */
export function ZlogTextWordmarkLetters({ zStyle = {}, logStyle = {} } = {}) {
  return (
    <>
      <span style={{ color: ZLOG_TEXT_WORDMARK_Z_COLOR, ...zStyle }}>Z</span>
      <span style={{ color: 'var(--text)', ...logStyle }}>log</span>
    </>
  )
}

/** Subtle Zlog wordmark — orange “Z” (var(--rust)), warm white “log” */
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
      <ZlogTextWordmarkLetters />
    </div>
  )
}

const BRAND_WORDMARK_SIZES = {
  sm: 24,
  md: 30,
  default: 38,
  lg: 57, // Auth mastheads only — authenticated app locks md via ZlogBrandRegion
}

/**
 * LOCKED spacing for ZlogBrandRegion + page chrome beneath it (8px grid).
 * Do not invent per-page wordmark/glow margins.
 */
export const BRAND_HEADER_SPACE = {
  /**
   * Top offset of the canonical brand region (safe-area / dark air above glow+wordmark).
   * Moves the entire authenticated composition down — not wordmark-only margin.
   */
  regionPadTop: 48,
  /**
   * Bottom of brand region = clear air before next chrome (Reporting For / Back+title).
   * Target ~40–48px; must stay larger than belowControls / headerToContent.
   */
  regionPadBottom: 40,
  /** Minimum brand-region height (wordmark + atmospheric glow breathing) */
  regionMinHeight: 88,
  /** Gap after page nav / utility row before first content (~24–32) */
  belowControls: 24,
  /** Shared report-module nav row height (Back + title baseline) */
  navRowMinHeight: 48,
  /** Dashboard: utility row → report-card grid */
  headerToContent: 28,
  headerPadX: 16,
}

/**
 * Compact workbench brand region — all PremiumShell module/working screens (default).
 * Maximises mobile working space once the user is inside a task.
 */
export const WORKBENCH_BRAND_HEADER_SPACE = {
  regionPadTop: 28,
  regionPadBottom: 12,
  regionMinHeight: 64,
  belowControls: 12,
  navRowMinHeight: 44,
  wordmarkOffsetY: -10,
}

export const AUTHENTICATED_SHELL_BRAND_WORKBENCH_STYLE = {
  minHeight: WORKBENCH_BRAND_HEADER_SPACE.regionMinHeight,
  paddingTop: WORKBENCH_BRAND_HEADER_SPACE.regionPadTop,
  paddingBottom: WORKBENCH_BRAND_HEADER_SPACE.regionPadBottom,
}

/**
 * Compact brand-region spacing — dashboard masthead only (Sign out sits immediately below).
 * Landing/Dashboard keep this treatment; PremiumShell workbench screens use WORKBENCH_* tokens.
 */
export const AUTHENTICATED_SHELL_BRAND_COMPACT_STYLE = {
  minHeight: 64,
  paddingTop: 30,
  paddingBottom: 8,
}

/**
 * Shared authenticated shell header chrome — full-bleed wordmark glow, no vertical clip.
 * Do not copy onto the landing page. Do not change glow colour / opacity / blur.
 */
export const AUTHENTICATED_SHELL_HEADER_STYLE = {
  position: 'relative',
  overflowX: 'visible',
  overflowY: 'visible',
  background: 'transparent',
}

/**
 * Atmospheric brand glow geometry — sized to the wordmark box, never 100vw.
 * 100vw includes the scrollbar gutter and forces horizontal overflow past the
 * layout viewport (fails the Global Mobile UI no-horizontal-scroll rule).
 */
export const BRAND_ATMOSPHERIC_GLOW_STYLE = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: '100%',
  maxWidth: '100%',
  height: '180px',
  pointerEvents: 'none',
  opacity: 0.42,
  filter: 'blur(45px)',
  background:
    'radial-gradient(ellipse 65% 75% at 50% 50%, color-mix(in srgb, var(--rust), transparent 38%) 0%, color-mix(in srgb, var(--rust), transparent 72%) 48%, color-mix(in srgb, var(--rust), transparent 94%) 75%, rgba(13,15,18,0) 92%)',
  zIndex: 0,
}

/**
 * FINAL LOCKED brand masthead — text wordmark Z = var(--rust), log = warm white; opacity 0.42 glow.
 * Authenticated screens consume this only via ZlogBrandRegion (size md).
 * size lg remains for public auth pages (login/signup).
 */
export function ZlogBrandWordmark({ size = 'lg', centered = true, style = {} }) {
  const fontSize = BRAND_WORDMARK_SIZES[size] ?? BRAND_WORDMARK_SIZES.lg

  return (
    <div
      className="zlog-brand-wordmark"
      aria-label="Zlog"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        marginLeft: centered ? 'auto' : undefined,
        marginRight: centered ? 'auto' : undefined,
        userSelect: 'none',
        transform: 'translateY(-16px)',
        ...style,
      }}
    >
      {/* Approved atmospheric radial glow — do not restyle per page.
          Width must NOT use 100vw: vw includes the scrollbar gutter and overflows
          the layout viewport (horizontal scroll). Size to the wordmark box instead. */}
      <div
        aria-hidden
        data-zlog-brand-glow=""
        style={BRAND_ATMOSPHERIC_GLOW_STYLE}
      />
      <h1
        style={{
          position: 'relative',
          zIndex: 1,
          fontFamily: 'var(--font-space-grotesk)',
          fontSize,
          fontWeight: 800,
          letterSpacing: '-0.03em',
          color: '#f3f4f6',
          margin: 0,
        }}
      >
        <ZlogTextWordmarkLetters logStyle={{ color: '#f3f4f6' }} />
      </h1>
    </div>
  )
}

/**
 * LOCKED ZLOG BRAND REGION — canonical authenticated-app wordmark, glow and vertical spacing.
 * Do not reproduce or override per page.
 *
 * Owns: centred ZlogBrandWordmark (md), approved --rust glow, region pad top/bottom,
 * min height, and spacing to chrome immediately below.
 * Page nav (Back / title) and dashboard utilities are NOT part of this region.
 */
export function ZlogBrandRegion({ style = {}, headerMode = 'expressive' } = {}) {
  const isWorkbench = headerMode === 'workbench'
  const regionSpace = isWorkbench ? WORKBENCH_BRAND_HEADER_SPACE : BRAND_HEADER_SPACE

  return (
    <div
      className={`zlog-brand-region${isWorkbench ? ' zlog-brand-region--workbench' : ''}`}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        minHeight: regionSpace.regionMinHeight,
        paddingTop: regionSpace.regionPadTop,
        paddingBottom: regionSpace.regionPadBottom,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <ZlogBrandWordmark
        size="md"
        centered
        style={isWorkbench ? { transform: `translateY(${regionSpace.wordmarkOffsetY}px)` } : undefined}
      />
    </div>
  )
}

/**
 * Canonical framed Sign out — the only authenticated-app Sign Out treatment.
 * Visual plate: .zlog-dashboard-signout (isolated from Back’s .zlog-secondary-cta).
 * Do not invent per-page Sign Out styles. Do not add this control to pages that have none.
 */
export function ZlogSignOutControl({
  onClick,
  disabled = false,
  signingOut = false,
}) {
  const busy = disabled || signingOut
  return (
    <button
      type="button"
      className="zlog-dashboard-signout"
      disabled={busy}
      onClick={onClick}
      aria-label={signingOut ? 'Signing out' : 'Sign out'}
    >
      <LogOut size={16} strokeWidth={2.25} aria-hidden className="zlog-dashboard-signout__icon" />
      <span className="zlog-dashboard-signout__label">
        {signingOut ? 'Signing out…' : 'Sign out'}
      </span>
    </button>
  )
}

/**
 * Canonical Zlog Back control — shared .zlog-secondary-cta plate (not Sign out).
 * Dashboard Sign out is a framed utility below Zlog (ZlogSignOutControl / .zlog-dashboard-signout), not this plate.
 */
export function ZlogBackControl({
  href,
  onClick,
  label = 'Back',
  className = '',
  style,
  disabled = false,
}) {
  const classes = `zlog-secondary-cta zlog-back-cta ${className}`.trim()
  const content = (
    <>
      <ArrowLeft size={15} strokeWidth={2.5} aria-hidden className="zlog-secondary-cta__icon" />
      <span className="zlog-secondary-cta__label">{label}</span>
    </>
  )
  const aria = `Go ${String(label).toLowerCase()}`

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        style={style}
        onClick={onClick}
        aria-label={aria}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      className={classes}
      style={style}
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
    >
      {content}
    </button>
  )
}

/** @deprecated Prefer ZlogBackControl — kept as a thin alias for existing imports. */
export function PremiumBackButton({ onClick, href, label = 'Back' }) {
  return <ZlogBackControl href={href} onClick={onClick} label={label} />
}

/**
 * LOCKED report-module navigation — Back + page title as one workspace header row.
 * Sits beneath ZlogBrandRegion. Used by all report modules via ZlogInternalHeader / PremiumShell.
 * Do not reinvent Back/title chrome per page.
 *
 * For stronger module identity (hub / chooser screens), prefer ZlogModulePageHeader
 * inside page content with hideModuleNav on the shell — Site Diary is the reference.
 */
export function ReportModuleNav({
  title,
  onBack,
  backHref,
  trailing = null,
  headerMode = 'expressive',
}) {
  const isWorkbench = headerMode === 'workbench'
  const navSpace = isWorkbench ? WORKBENCH_BRAND_HEADER_SPACE : BRAND_HEADER_SPACE

  const backControl =
    backHref || onBack ? (
      <ZlogBackControl href={backHref} onClick={onBack} />
    ) : (
      <div className="shrink-0" style={{ width: 88 }} aria-hidden />
    )

  return (
    <nav
      className="zlog-report-module-nav"
      aria-label="Report navigation"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: navSpace.navRowMinHeight,
        paddingTop: isWorkbench ? 2 : 4,
        paddingBottom: isWorkbench ? 8 : 12,
        marginBottom: navSpace.belowControls,
      }}
    >
      {backControl}

      {title ? (
        <h1
          className="zlog-report-module-title"
          style={{
            flex: 1,
            margin: 0,
            minWidth: 0,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            lineHeight: 1.25,
            color: 'var(--text)',
          }}
        >
          {title}
        </h1>
      ) : (
        <div style={{ flex: 1 }} aria-hidden />
      )}

      {trailing || <div className="shrink-0" style={{ width: 88 }} aria-hidden />}
    </nav>
  )
}

/**
 * Module Back — alias of ZlogBackControl (Site Diary hub / module page headers).
 */
export function ZlogModuleBackControl({ href, onClick, label = 'Back' }) {
  return <ZlogBackControl href={href} onClick={onClick} label={label} />
}

/**
 * Module page header — Back + dominant module title + optional supporting copy.
 * Sits in the page content column (same width/alignment as cards), beneath ZlogBrandRegion.
 * Reference implementation: Site Diary hub. Other modules may adopt later.
 */
export function ZlogModulePageHeader({
  title,
  subtitle = null,
  onBack,
  backHref,
  style,
}) {
  const showBack = Boolean(backHref || onBack)

  return (
    <header
      className="zlog-module-page-header"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        // Tighter when no supporting copy — title sits directly above primary task UI.
        marginBottom: subtitle ? 28 : 20,
        ...style,
      }}
    >
      {showBack ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            minHeight: 44,
            marginBottom: 8,
          }}
        >
          <ZlogModuleBackControl href={backHref} onClick={onBack} />
        </div>
      ) : null}

      {title ? (
        <h1
          className="zlog-module-page-title"
          style={{
            margin: 0,
            fontFamily: 'var(--font-space-grotesk), sans-serif',
            fontSize: 'clamp(28px, 7vw, 34px)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.12,
            color: 'var(--text)',
          }}
        >
          {title}
        </h1>
      ) : null}

      {subtitle ? (
        <p
          className="zlog-module-page-subtitle"
          style={{
            margin: title ? '12px 0 0' : 0,
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 1.45,
            color: 'color-mix(in srgb, var(--text) 86%, var(--text-2))',
            maxWidth: '34em',
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </header>
  )
}

/**
 * Sub-page chrome: ZlogBrandRegion + ReportModuleNav (Back / title).
 * Brand spacing comes only from ZlogBrandRegion — do not add wordmark margins here.
 * reportName / meta / subtitle — ignored (API compat only; never rendered)
 */
export function ZlogInternalHeader({
  title,
  reportName: _reportName,
  meta: _meta,
  subtitle: _subtitle,
  onBack,
  backHref,
  accent: _accent = DIARY_ACCENT,
  trailing = null,
  hideModuleNav = false,
  stickyBack = false,
  brandRegionStyle,
  headerMode = 'workbench',
  contentMaxWidth = 448,
}) {
  const showNavRow = !hideModuleNav && Boolean(backHref || onBack || title || trailing)
  // stickyBack moves Back into the sticky dock inside main. ReportModuleNav then
  // renders its own spacer in Back's place, so the title stays centred.
  const navBackHref = stickyBack ? undefined : backHref
  const navOnBack = stickyBack ? undefined : onBack

  return (
    <>
      <header
        className="premium-shell-header zlog-internal-header"
        style={{
          ...AUTHENTICATED_SHELL_HEADER_STYLE,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          borderBottom: 'none',
          padding: 0,
          pointerEvents: 'auto',
        }}
      >
        <ZlogBrandRegion style={brandRegionStyle} headerMode={headerMode} />
      </header>

      {showNavRow ? (
        <div className="w-full px-4" style={{ boxSizing: 'border-box' }}>
          <div
            style={{
              boxSizing: 'border-box',
              width: '100%',
              maxWidth: contentMaxWidth,
              margin: '0 auto',
              padding: `0 ${BRAND_HEADER_SPACE.headerPadX}px`,
            }}
          >
            <ReportModuleNav
              title={title}
              onBack={navOnBack}
              backHref={navBackHref}
              trailing={trailing}
              headerMode={headerMode}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

/** Canonical name for the locked sub-page header — all report views must use this via SubPageLayout */
export const SubPageHeader = ZlogInternalHeader

/**
 * Sign-in-matched sub-page shell — flat #0d0f12, centered wordmark + glow, no legacy metadata.
 * reportName / meta / subtitle are accepted but never painted (API compat only).
 */
export function SubPageLayout({
  title,
  reportName: _reportName,
  meta: _meta,
  subtitle: _subtitle,
  onBack,
  backHref = '/dashboard',
  accent = DIARY_ACCENT,
  children,
  maxWidth,
  trailing = null,
  hideModuleNav = false,
  stickyBack = false,
  brandRegionStyle,
  headerMode = 'workbench',
}) {
  const contentMaxWidth = maxWidth ?? 448
  const showStickyBack = stickyBack && !hideModuleNav && Boolean(backHref || onBack)
  const shellClassName =
    headerMode === 'workbench'
      ? 'min-h-screen bg-[#0d0f12] text-[#f3f4f6] flex flex-col pb-6 pt-0 selection:bg-[#ff5500]/30 zlog-workbench-shell'
      : 'min-h-screen bg-[#0d0f12] text-[#f3f4f6] flex flex-col pb-6 pt-0 selection:bg-[#ff5500]/30'

  return (
    <div className={shellClassName}>
      <style>{premiumScopedCss}</style>

      <SubPageHeader
        title={hideModuleNav ? undefined : title}
        onBack={hideModuleNav ? undefined : onBack}
        backHref={hideModuleNav ? undefined : backHref}
        accent={accent}
        trailing={hideModuleNav ? null : trailing}
        hideModuleNav={hideModuleNav}
        stickyBack={stickyBack}
        brandRegionStyle={brandRegionStyle}
        headerMode={headerMode}
        contentMaxWidth={contentMaxWidth}
      />

      <div className="px-4">
        <main className="w-full mx-auto flex-1" style={{ maxWidth: contentMaxWidth }}>
          {showStickyBack ? (
            <div className="zlog-sticky-back-dock" data-sticky-back>
              <ZlogBackControl href={backHref} onClick={onBack} />
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  )
}

/**
 * Uniform report / sub-page shell. Delegates to SubPageLayout (login-matched header).
 * reportName / meta / subtitle are accepted but never painted in the header (prevents legacy strings).
 *
 * headerMode defaults to `workbench` (compact brand region + nav spacing).
 * Pass `headerMode="expressive"` only when the full masthead is intentionally required.
 */
export function PremiumShell(props) {
  return <SubPageLayout {...props} />
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
