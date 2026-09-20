import 'server-only'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { DiaryPdfDocument } from '@/components/pdf/DiaryPdfDocument'

function nowMs() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now()
}

/**
 * @param {Record<string, unknown>} props DiaryPdfDocument props
 * @returns {Promise<{ buffer: Buffer, renderMs: number }>}
 */
export async function renderSiteDiaryPdfBuffer(props) {
  const renderT0 = nowMs()
  const doc = createElement(DiaryPdfDocument, props)
  const buffer = await renderToBuffer(doc)
  const renderMs = nowMs() - renderT0
  const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  return { buffer: nodeBuffer, renderMs }
}
