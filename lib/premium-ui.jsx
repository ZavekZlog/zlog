'use client'

export const DIARY_ACCENT = '255,140,66'
export const CTA_ORANGE = '#F5762A'

export const pageBackground = {
  minHeight: '100vh',
  color: '#fff',
  fontFamily: 'sans-serif',
  backgroundColor: '#0b0d12',
  backgroundImage: `
    radial-gradient(ellipse 78% 58% at 50% 44%, rgba(90, 106, 126, 0.09) 0%, transparent 70%),
    radial-gradient(ellipse 95% 72% at 50% 108%, rgba(58, 70, 86, 0.055) 0%, transparent 52%),
    linear-gradient(180deg, rgba(74, 90, 110, 0.035) 0%, transparent 38%, rgba(74, 90, 110, 0.025) 100%),
    linear-gradient(172deg, #0b0d12 0%, #0d1016 38%, #0f1219 68%, #11151c 100%)
  `,
}

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
`

export const labelStyle = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#8ea2b5',
  marginBottom: 8,
  fontWeight: 600,
}

export const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  background: 'rgba(11, 25, 41, 0.78)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '10px',
  color: '#FAFAF8',
  fontSize: 15,
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

export const glassPanelStyle = {
  background: 'linear-gradient(160deg, rgba(15, 33, 53, 0.93) 0%, rgba(11, 25, 41, 0.9) 100%)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.16)',
  borderRadius: '16px',
  padding: '22px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.09)',
  marginBottom: 16,
}

export const sectionTitleStyle = {
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#FAFAF8',
  marginBottom: 16,
}

export const accentBarStyle = (accent) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: '2.55px',
  background: `linear-gradient(90deg, transparent 0%, rgba(${accent}, 0.95) 22%, rgba(255, 255, 255, 0.7) 50%, rgba(${accent}, 0.95) 78%, transparent 100%)`,
  boxShadow: `0 0 15px rgba(${accent}, 0.5), 0 2px 8px rgba(${accent}, 0.32)`,
  pointerEvents: 'none',
  borderRadius: '16px 16px 0 0',
})

export function primaryButtonStyle(accent = DIARY_ACCENT, disabled = false) {
  return {
    width: '100%',
    padding: '14px 16px',
    background: CTA_ORANGE,
    color: '#0b0d12',
    border: 'none',
    borderRadius: '10px',
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
  }
}

export function ghostButtonStyle() {
  return {
    background: 'transparent',
    border: 'none',
    color: '#8ea2b5',
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
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    minHeight: 44,
    padding: '8px 16px',
    background: 'linear-gradient(160deg, rgba(15, 33, 53, 0.72) 0%, rgba(11, 25, 41, 0.58) 100%)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    borderRadius: 999,
    color: '#FFFFFF',
    fontWeight: 500,
    fontSize: 14,
    letterSpacing: '0.02em',
    cursor: 'pointer',
    lineHeight: 1,
    fontFamily: 'inherit',
    flexShrink: 0,
  }
}

export function PremiumBackButton({ onClick, label = 'Back' }) {
  return (
    <button type="button" className="premium-back-btn" onClick={onClick} style={premiumBackPillStyle()} aria-label={`Go ${label.toLowerCase()}`}>
      <span className="premium-back-btn__arrow" aria-hidden>←</span>
      <span>{label}</span>
    </button>
  )
}

export function PremiumShell({ title, subtitle, onBack, accent = DIARY_ACCENT, children, maxWidth = 640 }) {
  return (
    <div className="dashboard-premium-bg" style={pageBackground}>
      <style>{premiumScopedCss}</style>
      <div
        className="premium-shell-header"
        style={{
          background: 'transparent',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {onBack && (
          <PremiumBackButton onClick={onBack} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#FAFAF8' }}>{title}</div>
          {subtitle && <div className="premium-shell-subtitle" style={{ fontSize: '12px', color: '#8ea2b5', marginTop: 2 }}>{subtitle}</div>}
        </div>
        <div style={{ width: 28, height: 3, borderRadius: 999, background: `rgba(${accent}, 0.85)`, boxShadow: `0 0 12px rgba(${accent}, 0.45)` }} />
      </div>
      <div style={{ padding: '20px 24px 32px', maxWidth, margin: '0 auto' }}>{children}</div>
    </div>
  )
}

export function GlassSection({ title, accent = DIARY_ACCENT, children }) {
  return (
    <section className="premium-glass-panel" style={{ ...glassPanelStyle, position: 'relative', overflow: 'hidden' }}>
      <div className="premium-accent-bar" style={accentBarStyle(accent)} />
      {title && <h2 className="premium-section-title" style={{ ...sectionTitleStyle, marginTop: 4 }}>{title}</h2>}
      {children}
    </section>
  )
}

export const premiumDiaryEmptyClass = 'premium-diary-empty'
export const premiumDiaryEmptyTitleClass = 'premium-diary-empty__title'
export const premiumDiaryEmptyHintClass = 'premium-diary-empty__hint'

/** Shared dashboard module card tokens — import on future pages; mobile overrides in globals.css */
export const dashboardCardStyle = {
  position: 'relative',
  width: '100%',
  padding: '28px',
  background: 'linear-gradient(160deg, rgba(15, 33, 53, 0.94) 0%, rgba(11, 25, 41, 0.92) 100%)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderRadius: '16px',
  cursor: 'pointer',
  textAlign: 'left',
  overflow: 'hidden',
  fontFamily: 'inherit',
  color: '#fff',
  border: '1px solid rgba(255, 255, 255, 0.17)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
}

export const dashboardCardTitleStyle = {
  fontWeight: 700,
  fontSize: '16px',
  color: '#FAFAF8',
  marginBottom: '10px',
  lineHeight: 1.35,
}

export const dashboardCardDescStyle = {
  fontSize: '13px',
  color: '#93a7b9',
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
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 4px 18px rgba(${accent}, 0.2)`,
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
    border: 1px solid rgba(255, 255, 255, 0.17);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.1);
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
      0 24px 64px rgba(0, 0, 0, 0.54),
      0 0 52px rgba(var(--accent), 0.32),
      0 0 2px rgba(var(--accent), 0.55),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
  }
  .premium-dash-card-wrap:hover .premium-dash-accent { filter: brightness(1.2); }
  .premium-dash-card-wrap:hover .premium-dash-icon { filter: brightness(1.15); }
  .premium-dash-card-wrap .premium-dash-card:active {
    transform: scale(0.985);
    transition-duration: 120ms;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }
  .premium-dash-card-wrap:hover .premium-dash-card:active {
    transform: translateY(-6px) scale(0.985);
    filter: brightness(1.04);
    border-color: rgba(var(--accent), 0.38);
    box-shadow:
      0 18px 48px rgba(0, 0, 0, 0.48),
      0 0 32px rgba(var(--accent), 0.2),
      0 0 1px rgba(var(--accent), 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
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
      background: linear-gradient(160deg, rgba(15, 33, 53, 0.94) 0%, rgba(11, 25, 41, 0.92) 100%) !important;
      border: 1px solid rgba(255, 255, 255, 0.17) !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
    }

    .premium-dash-card-title {
      color: #FFFFFF !important;
      font-size: 17px !important;
      font-weight: 700 !important;
      line-height: 1.32 !important;
      margin-bottom: 8px !important;
    }

    .premium-dash-card-desc {
      color: #A3B5C4 !important;
      font-size: 14px !important;
      line-height: 1.55 !important;
    }

    .premium-dash-icon {
      margin-bottom: 14px !important;
      filter: brightness(1.1);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 4px 22px rgba(var(--accent), 0.26) !important;
      border-color: rgba(var(--accent), 0.38) !important;
    }

    .premium-dash-accent {
      height: 3.6px !important;
      transition: filter 100ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 100ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    .premium-dash-card-wrap:active .premium-dash-card {
      transform: translateY(-5px) scale(1.01) !important;
      transition-duration: 100ms;
      filter: brightness(1.05);
      border-color: rgba(var(--accent), 0.62) !important;
      box-shadow:
        0 20px 52px rgba(0, 0, 0, 0.5),
        0 0 44px rgba(var(--accent), 0.38),
        0 0 3px rgba(var(--accent), 0.62),
        inset 0 1px 0 rgba(255, 255, 255, 0.14) !important;
    }

    .premium-dash-card-wrap:active .premium-dash-accent {
      filter: brightness(1.38);
      box-shadow: 0 0 18px rgba(var(--accent), 0.58), 0 2px 10px rgba(var(--accent), 0.42);
    }

    .premium-dash-card-wrap:active .premium-dash-icon {
      filter: brightness(1.22);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 4px 26px rgba(var(--accent), 0.34) !important;
    }

    .premium-dash-card-wrap .premium-dash-card:active,
    .premium-dash-card-wrap:hover .premium-dash-card:active {
      transform: translateY(-5px) scale(1.01) !important;
      transition-duration: 100ms;
      filter: brightness(1.05);
      border-color: rgba(var(--accent), 0.62) !important;
      box-shadow:
        0 20px 52px rgba(0, 0, 0, 0.5),
        0 0 44px rgba(var(--accent), 0.38),
        0 0 3px rgba(var(--accent), 0.62),
        inset 0 1px 0 rgba(255, 255, 255, 0.14) !important;
    }

    .premium-back-btn__arrow {
      font-size: 22px;
    }
  }
`
