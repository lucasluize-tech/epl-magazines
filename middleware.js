import { NextResponse } from 'next/server'
import { decrypt } from './lib/session.js'
import { cookies } from 'next/headers'

const publicRoutes = ['/login']

export async function middleware(request) {
  const path = request.nextUrl.pathname
  const isPublicRoute = publicRoutes.includes(path)

  const cookieStore = await cookies()
  const cookie = cookieStore.get('session')?.value
  const session = await decrypt(cookie)

  // Redirect unauthenticated users trying to access protected routes
  if (!isPublicRoute && !session?.userId) {
    return NextResponse.redirect(new URL('/login', request.nextUrl))
  }

  // Redirect authenticated users away from login
  if (isPublicRoute && session?.userId) {
    return NextResponse.redirect(new URL('/', request.nextUrl))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
