'use client'

import { useCallback, useLayoutEffect, useRef } from 'react'
import { textareaStyle } from '@/lib/premium-ui'

/** ~3 lines at 15px / 1.55 line-height — compact empty state still scrolls with page. */
const NARRATIVE_MIN_HEIGHT_PX = 72

/**
 * Site Diary narrative fields: page scroll only, no nested vertical scrollbar.
 */
export function DiaryNarrativeTextarea({
  value = '',
  onChange,
  onInput,
  disabled = false,
  placeholder,
  style,
  marginBottom = 0,
  ...rest
}) {
  const ref = useRef(null)

  const syncHeight = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    const next = Math.max(NARRATIVE_MIN_HEIGHT_PX, el.scrollHeight)
    el.style.height = `${next}px`
  }, [])

  useLayoutEffect(() => {
    syncHeight()
  }, [value, syncHeight])

  const handleChange = (event) => {
    onChange?.(event)
    queueMicrotask(syncHeight)
  }

  const handleInput = (event) => {
    onInput?.(event)
    syncHeight()
  }

  return (
    <textarea
      ref={ref}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      rows={1}
      onChange={handleChange}
      onInput={handleInput}
      style={{
        ...textareaStyle,
        resize: 'none',
        overflowY: 'hidden',
        minHeight: NARRATIVE_MIN_HEIGHT_PX,
        marginBottom,
        boxSizing: 'border-box',
        ...style,
      }}
      {...rest}
    />
  )
}
