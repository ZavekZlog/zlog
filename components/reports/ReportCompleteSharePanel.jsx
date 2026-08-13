'use client'

/**
 * Reusable report completion / share panel.
 * Pattern: Save PDF (primary) → Share Report (icon destinations) → Return.
 * Use across Site Diary, Survey, Progress, Snags, H&S when those flows complete.
 */

import { FileDown, Mail, Share2 } from 'lucide-react'
import { PrimaryCTA, SecondaryButton, typeTokens } from '@/lib/premium-ui'

const panelCss = `
  .zlog-report-share-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .zlog-report-share-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 88px;
    padding: 14px 8px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--edge) 48%, var(--text) 28%);
    background: color-mix(in srgb, var(--plate), var(--text) 8%);
    color: var(--text);
    box-shadow: inset 0 1px 0 var(--edge-highlight);
    cursor: pointer;
    font: inherit;
    transition:
      border-color 180ms cubic-bezier(0.22, 1, 0.36, 1),
      background 180ms cubic-bezier(0.22, 1, 0.36, 1),
      box-shadow 180ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 120ms cubic-bezier(0.22, 1, 0.36, 1),
      filter 180ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .zlog-report-share-tile:disabled {
    opacity: 0.65;
    cursor: wait;
  }
  .zlog-report-share-tile:not(:disabled):hover {
    border-color: color-mix(in srgb, var(--rust) 28%, var(--edge));
    background: color-mix(in srgb, var(--plate), var(--text) 12%);
    box-shadow:
      inset 0 1px 0 var(--edge-highlight),
      0 0 14px color-mix(in srgb, var(--rust) 12%, transparent);
  }
  .zlog-report-share-tile:not(:disabled):active {
    transform: translateY(1px);
    filter: brightness(0.97);
  }
  .zlog-report-share-tile__label {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1.2;
    color: var(--text);
  }
  .zlog-report-share-tile__icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  @media (max-width: 380px) {
    .zlog-report-share-row {
      gap: 8px;
    }
    .zlog-report-share-tile {
      min-height: 84px;
      padding: 12px 6px;
    }
  }
`

function WhatsAppGlyph({ size = 26 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#25D366"
        d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01zm-7.01 15.24c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.26 8.26 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c.02 4.54-3.7 8.23-8.22 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07s.89 2.4 1.01 2.56c.12.17 1.75 2.67 4.23 3.74 2.49 1.07 2.49.71 2.94.66.45-.05 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"
      />
    </svg>
  )
}

function sectionLabelStyle() {
  return {
    margin: '0 0 12px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'color-mix(in srgb, var(--text) 72%, var(--text-2))',
    textAlign: 'left',
  }
}

/**
 * @param {{
 *   savedTitle?: string,
 *   savedSubtitle?: string,
 *   savePdfLabel?: string,
 *   busyAction?: string | null,
 *   statusMessage?: string,
 *   onSavePdf?: () => void,
 *   onEmail?: () => void,
 *   onWhatsApp?: () => void,
 *   onMore?: () => void,
 *   onReturnDashboard?: () => void,
 * }} props
 */
export function ReportCompleteSharePanel({
  savedTitle = 'Report saved',
  savedSubtitle = 'Your report is ready.',
  savePdfLabel = 'Save PDF',
  busyAction = null,
  statusMessage = '',
  onSavePdf,
  onEmail,
  onWhatsApp,
  onMore,
  onReturnDashboard,
}) {
  const busy = Boolean(busyAction)
  const saveBusy = busyAction === 'save-pdf'
  const emailBusy = busyAction === 'email'
  const whatsAppBusy = busyAction === 'whatsapp'
  const moreBusy = busyAction === 'more' || busyAction === 'share'

  return (
    <div className="zlog-report-complete-share">
      <style>{panelCss}</style>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '28px 8px 8px',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 88,
            height: 88,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
            background: 'color-mix(in srgb, #22c55e 16%, var(--plate))',
            border: '1px solid color-mix(in srgb, #22c55e 42%, var(--edge))',
          }}
        >
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="#4ade80"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: '0.01em',
            color: 'var(--text)',
          }}
        >
          {savedTitle}
        </h1>
        <p
          style={{
            ...typeTokens.body,
            margin: '12px 0 0',
            fontSize: 16,
            lineHeight: 1.5,
            color: 'color-mix(in srgb, var(--text) 86%, var(--text-2))',
            maxWidth: 340,
          }}
        >
          {savedSubtitle}
        </p>
      </div>

      <div style={{ marginTop: 28, paddingBottom: 28 }}>
        <section aria-labelledby="zlog-save-report-heading">
          <h2 id="zlog-save-report-heading" style={sectionLabelStyle()}>
            Save your report
          </h2>
          <PrimaryCTA
            type="button"
            onClick={onSavePdf}
            disabled={busy}
            style={{ width: '100%', minHeight: 52, fontSize: 16, marginBottom: 0 }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <FileDown size={20} strokeWidth={2.25} aria-hidden />
              {saveBusy ? 'Preparing…' : savePdfLabel}
            </span>
          </PrimaryCTA>
        </section>

        <div
          aria-hidden
          style={{
            height: 1,
            margin: '26px 0 22px',
            background: 'color-mix(in srgb, var(--edge) 80%, transparent)',
          }}
        />

        <section aria-labelledby="zlog-share-report-heading">
          <h2 id="zlog-share-report-heading" style={sectionLabelStyle()}>
            Share report
          </h2>
          <div className="zlog-report-share-row" role="group" aria-label="Share report">
            <button
              type="button"
              className="zlog-report-share-tile"
              onClick={onEmail}
              disabled={busy}
              aria-label="Email"
            >
              <span className="zlog-report-share-tile__icon">
                <Mail size={26} strokeWidth={2} aria-hidden />
              </span>
              <span className="zlog-report-share-tile__label">
                {emailBusy ? '…' : 'Email'}
              </span>
            </button>

            <button
              type="button"
              className="zlog-report-share-tile"
              onClick={onWhatsApp}
              disabled={busy}
              aria-label="WhatsApp"
            >
              <span className="zlog-report-share-tile__icon">
                <WhatsAppGlyph />
              </span>
              <span className="zlog-report-share-tile__label">
                {whatsAppBusy ? '…' : 'WhatsApp'}
              </span>
            </button>

            <button
              type="button"
              className="zlog-report-share-tile"
              onClick={onMore}
              disabled={busy}
              aria-label="More share options"
            >
              <span className="zlog-report-share-tile__icon">
                <Share2 size={26} strokeWidth={2} aria-hidden />
              </span>
              <span className="zlog-report-share-tile__label">
                {moreBusy ? '…' : 'More'}
              </span>
            </button>
          </div>
        </section>

        <SecondaryButton
          type="button"
          onClick={onReturnDashboard}
          style={{ width: '100%', minHeight: 52, fontSize: 16, marginTop: 28, marginBottom: 0 }}
        >
          Return to Dashboard
        </SecondaryButton>

        {statusMessage ? (
          <p
            role="status"
            aria-live="polite"
            style={{
              margin: '18px 0 0',
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid var(--edge)',
              background: 'var(--plate)',
              color: 'color-mix(in srgb, var(--text) 90%, var(--text-2))',
              fontSize: 15,
              lineHeight: 1.45,
              textAlign: 'center',
            }}
          >
            {statusMessage}
          </p>
        ) : null}
      </div>
    </div>
  )
}
