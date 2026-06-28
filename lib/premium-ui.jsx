'use client'

export const DIARY_ACCENT = '255,140,66'

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
`

export const labelStyle = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#7a92a8',
  marginBottom: 8,
  fontWeight: 600,
}

export const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  background: 'rgba(11, 25, 41, 0.72)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '10px',
  color: '#F0EDE8',
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
  background: 'linear-gradient(160deg, rgba(15, 33, 53, 0.9) 0%, rgba(11, 25, 41, 0.84) 100%)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 255, 255, 0.13)',
  borderRadius: '16px',
  padding: '22px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
  marginBottom: 16,
}

export const sectionTitleStyle = {
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#F0EDE8',
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
    background: `rgb(${accent})`,
    color: '#0b0d12',
    border: 'none',
    borderRadius: '10px',
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: disabled ? 'wait' : 'pointer',
    opacity: disabled ? 0.7 : 1,
  }
}

export function ghostButtonStyle() {
  return {
    background: 'transparent',
    border: 'none',
    color: '#7a92a8',
    fontSize: 20,
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  }
}

export function PremiumShell({ title, subtitle, onBack, accent = DIARY_ACCENT, children, maxWidth = 640 }) {
  return (
    <div className="dashboard-premium-bg" style={pageBackground}>
      <style>{premiumScopedCss}</style>
      <div style={{ background: '#111', borderBottom: '1px solid #222', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        {onBack && (
          <button type="button" onClick={onBack} style={ghostButtonStyle()} aria-label="Go back">←</button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#F0EDE8' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '12px', color: '#7a92a8', marginTop: 2 }}>{subtitle}</div>}
        </div>
        <div style={{ width: 28, height: 3, borderRadius: 999, background: `rgba(${accent}, 0.85)`, boxShadow: `0 0 12px rgba(${accent}, 0.45)` }} />
      </div>
      <div style={{ padding: '20px 24px 32px', maxWidth, margin: '0 auto' }}>{children}</div>
    </div>
  )
}

export function GlassSection({ title, accent = DIARY_ACCENT, children }) {
  return (
    <section style={{ ...glassPanelStyle, position: 'relative', overflow: 'hidden' }}>
      <div style={accentBarStyle(accent)} />
      {title && <h2 style={{ ...sectionTitleStyle, marginTop: 4 }}>{title}</h2>}
      {children}
    </section>
  )
}
