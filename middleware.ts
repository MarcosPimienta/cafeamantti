import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // If a Supabase auth code lands on root or any other page, redirect to the callback handler
  const authCode = searchParams.get('code')
  if (authCode && pathname !== '/auth/callback') {
    const callbackUrl = new URL('/auth/callback', request.url)
    callbackUrl.searchParams.set('code', authCode)
    callbackUrl.searchParams.set('next', '/recovery/reset-password')
    return NextResponse.redirect(callbackUrl)
  }

  // Define paths that strictly REQUIRE authentication checks
  const isProtectedPath = pathname.startsWith('/portal') || pathname.startsWith('/dashboard')
  const isAdminPath = pathname.startsWith('/admin')
  const isAuthPath = pathname.startsWith('/login') || pathname.startsWith('/register')

  // Only run session updates and auth checks for protected, admin, or auth-specific pages.
  // Public pages (home, shop, cafe, info, etc.) bypass Edge auth to avoid 504 timeouts when DB is under load.
  if (isProtectedPath || isAdminPath || isAuthPath) {
    try {
      const { supabaseResponse, user } = await updateSession(request)

      if ((isProtectedPath || isAdminPath) && !user) {
        return NextResponse.redirect(new URL('/login', request.url))
      }

      if (isAuthPath && user) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }

      return supabaseResponse
    } catch (error) {
      console.error('[Middleware] Supabase auth check failed or timed out:', error)
      // On protected paths, redirect to login if auth service is temporarily unreachable
      if (isProtectedPath || isAdminPath) {
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }
  }

  // Fast path for public pages
  return NextResponse.next({
    request: {
      headers: request.headers,
    },
  })
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static image and asset extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
