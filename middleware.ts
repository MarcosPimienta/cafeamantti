import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Define paths that REQUIRE authentication checks
  const isProtectedPath = pathname.startsWith('/portal') || pathname.startsWith('/dashboard')
  const isAuthPath = pathname.startsWith('/login') || pathname.startsWith('/register')
  
  // Check for the presence of a Supabase session cookie
  const hasSessionCookie = request.cookies.getAll().some(cookie => cookie.name.startsWith('sb-'))

  // Optimization: Only run the expensive session update/user check if:
  // 1. We are on a protected or auth path
  // 2. We have a session cookie that might need refreshing
  if (isProtectedPath || isAuthPath || hasSessionCookie) {
    const { supabaseResponse, user } = await updateSession(request)

    if (isProtectedPath && !user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (isAuthPath && user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    return supabaseResponse
  }

  // Fast path for guest users on public pages
  return NextResponse.next({
    request: {
      headers: request.headers,
    },
  })
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
