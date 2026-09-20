/**
 * Pure authorization helper (testable in Node). Used only after session auth.
 */

export async function authorizeSiteDiaryReportForUser(userSupabase, adminSupabase, reportId) {
  const id = String(reportId || '').trim()
  if (!id) {
    return { ok: false, status: 400, code: 'missing-report-id' }
  }

  const {
    data: { user },
    error: authError,
  } = await userSupabase.auth.getUser()

  if (authError || !user?.id) {
    return { ok: false, status: 401, code: 'unauthenticated' }
  }

  const { data: row, error: rowError } = await adminSupabase
    .from('daily_reports')
    .select('id, project_id, projects ( owner_id )')
    .eq('id', id)
    .maybeSingle()

  if (rowError) {
    return { ok: false, status: 500, code: 'report-load-failed' }
  }
  if (!row) {
    return { ok: false, status: 404, code: 'report-not-found' }
  }

  const ownerId = row.projects?.owner_id ?? null
  if (!ownerId || String(ownerId) !== String(user.id)) {
    return { ok: false, status: 403, code: 'forbidden' }
  }

  return { ok: true, user, reportId: id, projectId: row.project_id }
}
