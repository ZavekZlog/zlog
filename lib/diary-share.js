/**
 * Site Diary share / PDF handoff.
 * Wire real PDF generation here later (e.g. DiaryPdfDocument + navigator.share).
 * Call sites should only depend on this function’s return shape.
 *
 * @param {{ projectId: string, reportId: string }} _params
 * @returns {Promise<{ ok: boolean, message?: string }>}
 */
export async function shareSiteDiaryReport(_params) {
  // PDF generation/share is not wired yet — keep this as the single integration point.
  return {
    ok: false,
    message: 'PDF generation coming next.',
  }
}
