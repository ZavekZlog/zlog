import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { safeAppReturnPath } from '@/lib/auth/return-path'

export async function middleware(request) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname, search } = request.nextUrl
  const protectedPaths = ['/dashboard', '/projects', '/settings', '/onboarding']
  const isProtected = protectedPaths.some(p => pathname.startsWith(p))
  const isAuthPage = ['/login', '/signup'].some(p => pathname.startsWith(p))

  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    const returnPath = safeAppReturnPath(`${pathname}${search}`)
    if (returnPath) url.searchParams.set('next', returnPath)
    return NextResponse.redirect(url)
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone()
    const next = safeAppReturnPath(request.nextUrl.searchParams.get('next'))
    if (next) {
      // next may include ?query — parse as relative path+search
      const target = new URL(next, request.nextUrl.origin)
      url.pathname = target.pathname
      url.search = target.search
    } else {
      url.pathname = '/dashboard'
      url.search = ''
    }
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
