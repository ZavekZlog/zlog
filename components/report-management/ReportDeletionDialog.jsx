'use client'

import { DestructiveButton, SecondaryButton } from '@/lib/premium-ui'
import {
  deleteReportActionLabel,
  deleteReportConfirmation,
} from '@/lib/report-deletion'

export function ReportDeletionDialog({
  open,
  count,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
  labels,
}) {
  if (!open) return null
  const action = deleteReportActionLabel(count, labels)
  const message = deleteReportConfirmation(count, labels)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="zlog-delete-report-title"
      aria-describedby="zlog-delete-report-message"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'color-mix(in srgb, var(--ink) 76%, transparent)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          padding: '20px 18px 16px',
          borderRadius: 12,
          border: '1px solid color-mix(in srgb, var(--danger) 42%, var(--edge))',
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--plate) 82%, var(--text) 4%) 0%, color-mix(in srgb, var(--ink) 55%, var(--plate)) 100%)',
          boxShadow:
            'inset 0 1px 0 color-mix(in srgb, var(--text), transparent 86%), 0 12px 32px color-mix(in srgb, var(--ink) 55%, transparent)',
        }}
      >
        <h2
          id="zlog-delete-report-title"
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1.25,
            color: 'var(--text)',
          }}
        >
          {action}?
        </h2>
        <p
          id="zlog-delete-report-message"
          style={{
            margin: '10px 0 0',
            fontSize: 15,
            lineHeight: 1.45,
            color: 'color-mix(in srgb, var(--text) 88%, var(--text-2))',
          }}
        >
          {message} This cannot be undone.
        </p>
        {error ? (
          <p role="alert" style={{ margin: '10px 0 0', color: '#ff6b6b', fontSize: 14 }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
          <SecondaryButton
            type="button"
            disabled={busy}
            onClick={onCancel}
            style={{ flex: '1 1 120px', width: 'auto', minHeight: 46 }}
          >
            Cancel
          </SecondaryButton>
          <DestructiveButton
            type="button"
            disabled={busy}
            onClick={onConfirm}
            style={{ flex: '1 1 150px', width: 'auto', minHeight: 46 }}
          >
            {busy ? 'Deleting…' : action}
          </DestructiveButton>
        </div>
      </div>
    </div>
  )
}
