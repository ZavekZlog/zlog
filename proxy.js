/**
 * Root auth boundary for Zlog.
 *
 * The Supabase adapter in lib/supabase/middleware.js only runs when a root file
 * exports it. Without this file the session cookies are never refreshed on
 * navigation and /dashboard is not guarded server-side.
 *
 * Next.js 16 renamed the `middleware` convention to `proxy`, so a root
 * middleware.js would be silently ignored.
 */
import { middleware } from './lib/supabase/middleware.js'

export function proxy(request) {
  return middleware(request)
}

// Next statically analyses this matcher, so it cannot be re-exported from the adapter.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
