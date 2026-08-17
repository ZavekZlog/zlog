const MAX_DELETE_COUNT = 50

export function normalizeReportIds(ids) {
  const unique = [...new Set(
    (Array.isArray(ids) ? ids : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  )]
  if (unique.length < 1) throw new Error('Choose at least one saved report to delete.')
  if (unique.length > MAX_DELETE_COUNT) {
    throw new Error(`You can delete up to ${MAX_DELETE_COUNT} saved reports at once.`)
  }
  return unique
}

export function toggleReportSelection(selectedIds, reportId) {
  const next = new Set(selectedIds || [])
  if (next.has(reportId)) next.delete(reportId)
  else next.add(reportId)
  return next
}

export function selectAllReports(reports) {
  return new Set((Array.isArray(reports) ? reports : []).map((row) => row?.id).filter(Boolean))
}

/** Approved copy: "Delete Diary" / "Delete n Diaries". */
export function deleteReportActionLabel(count, {
  singular = 'Diary',
  plural = 'Diaries',
} = {}) {
  return Number(count) === 1 ? `Delete ${singular}` : `Delete ${Number(count) || 0} ${plural}`
}

export function deleteReportConfirmation(count, {
  singular = 'saved diary',
  plural = 'saved diaries',
} = {}) {
  return Number(count) === 1
    ? `Permanently delete this ${singular}?`
    : `Permanently delete these ${Number(count) || 0} ${plural}?`
}

export function savedReportListHref({ modulePath = '/dashboard/diary', projectId = null } = {}) {
  const params = new URLSearchParams({ view: 'saved' })
  if (projectId) params.set('project', String(projectId))
  return `${modulePath}?${params.toString()}`
}

function rpcPayload(data) {
  if (Array.isArray(data)) return data[0] || {}
  return data || {}
}

function cleanupJobsFrom(data) {
  const jobs = Array.isArray(data?.cleanupJobs)
    ? data.cleanupJobs
    : Array.isArray(data?.cleanup_jobs)
      ? data.cleanup_jobs
      : []
  return jobs
    .map((job) => ({
      id: String(job?.id || '').trim(),
      path: String(job?.path || job?.object_path || '').trim(),
    }))
    .filter((job) => job.id && job.path)
}

/**
 * Delete one or more Site Diaries through the ownership-checked transactional
 * RPC, then process the durable Storage cleanup jobs returned by that RPC.
 *
 * Database success is authoritative. A Storage failure leaves durable pending
 * jobs instead of restoring a partially deleted diary or losing cleanup work.
 */
export async function deleteSiteDiaries(supabase, reportIds) {
  const ids = normalizeReportIds(reportIds)
  const { data, error } = await supabase.rpc('delete_site_diaries', {
    p_report_ids: ids,
  })
  if (error) {
    throw new Error(error.message || 'We couldn’t delete the selected diaries. Try again.')
  }

  const result = rpcPayload(data)
  const deletedIds = (result.deletedIds || result.deleted_ids || []).map(String)
  if (
    deletedIds.length !== ids.length
    || ids.some((id) => !deletedIds.includes(id))
  ) {
    throw new Error('The selected diaries were not all deleted. Refresh the list and try again.')
  }

  const jobs = cleanupJobsFrom(result)
  if (!jobs.length) return { ok: true, deletedIds, cleanupPending: false }

  let cleanupError = null
  try {
    const { error: storageError } = await supabase.storage
      .from('site-photos')
      .remove(jobs.map((job) => job.path))
    cleanupError = storageError?.message || null
  } catch (errorCaught) {
    cleanupError = errorCaught?.message || 'Storage cleanup could not be completed.'
  }

  const { error: markError } = await supabase.rpc('mark_report_storage_cleanup', {
    p_job_ids: jobs.map((job) => job.id),
    p_error: cleanupError,
  })

  return {
    ok: true,
    deletedIds,
    cleanupPending: Boolean(cleanupError || markError),
  }
}
