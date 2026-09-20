/**
 * Initial daily_reports row fetch for Site Diary PDF prepare (bounded).
 */

export const PDF_REPORT_FETCH_TIMEOUT_MS = 15_000

export const DAILY_REPORT_FOR_PDF_SELECT = `
        id,
        project_id,
        report_number,
        report_date,
        weather,
        shift,
        site_summary,
        visitors,
        visitors_register_provenance,
        delays_issues,
        actions,
        hs_incidents,
        rfis,
        variations,
        company_reporting_for,
        creator_name,
        creator_role,
        signature_url,
        cover_photo_url,
        branding_id,
        brand_color,
        brand_logo_url,
        equipment_hire,
        temporary_works_applicable,
        temporary_works,
        cover_processing_version,
        sign_in_sheet_url,
        projects (
          id,
          name,
          site_address,
          client_name,
          client_pm,
          start_date,
          planned_completion_date
        )
      `

export const DIARY_PDF_REPORT_FETCH_TIMEOUT_MESSAGE =
  "We couldn't load this Site Diary for PDF export in time. Try again."

export class DiaryPdfReportFetchTimeoutError extends Error {
  constructor() {
    super(DIARY_PDF_REPORT_FETCH_TIMEOUT_MESSAGE)
    this.name = 'DiaryPdfReportFetchTimeoutError'
    this.code = 'report_fetch_timeout'
  }
}

function isAbortLike(error) {
  if (!error) return false
  if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') return true
  const msg = String(error?.message || '')
  return /aborted/i.test(msg) && /AbortSignal/i.test(msg)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} reportId
 * @param {{ timeoutMs?: number }} [options]
 */
export async function fetchDailyReportRowForSiteDiaryPdf(
  supabase,
  reportId,
  { timeoutMs = PDF_REPORT_FETCH_TIMEOUT_MS } = {},
) {
  const controller = new AbortController()
  let timer
  const ms = Number(timeoutMs)
  if (Number.isFinite(ms) && ms > 0) {
    timer = setTimeout(() => {
      controller.abort()
    }, ms)
  }

  try {
    const { data, error } = await supabase
      .from('daily_reports')
      .select(DAILY_REPORT_FOR_PDF_SELECT)
      .eq('id', reportId)
      .abortSignal(controller.signal)
      .maybeSingle()

    if (controller.signal.aborted) {
      throw new DiaryPdfReportFetchTimeoutError()
    }
    if (error && isAbortLike(error)) {
      throw new DiaryPdfReportFetchTimeoutError()
    }
    return { data, error }
  } catch (err) {
    if (err instanceof DiaryPdfReportFetchTimeoutError) {
      throw err
    }
    if (controller.signal.aborted || isAbortLike(err)) {
      throw new DiaryPdfReportFetchTimeoutError()
    }
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}
