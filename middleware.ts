import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
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

  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/login')
  const isOnboarding = pathname.startsWith('/onboarding')
  const isCallback = pathname.startsWith('/auth/callback') || pathname.startsWith('/auth/confirm')
  const isPublic = pathname.startsWith('/privacy') || pathname.startsWith('/terms') || pathname.startsWith('/unsubscribe')
  const isInngest = pathname.startsWith('/api/inngest')
  const isWebhook = pathname.startsWith('/api/email/inbound')
  const isAuthApi = pathname.startsWith('/api/auth')
  const isOnboardingApi = pathname.startsWith('/api/onboarding')
  const isSettingsApi = pathname.startsWith('/api/settings')
  const isAccountApi = pathname.startsWith('/api/account')

  // Let public pages, callbacks, Inngest, inbound webhooks, and auth API through always
  if (isCallback || isPublic || isInngest || isWebhook || isAuthApi || isOnboardingApi || isSettingsApi || isAccountApi) return supabaseResponse

  // Unauthenticated — only allow login
  if (!user && !isAuthRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Authenticated — redirect away from login
  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Authenticated — check if onboarding is complete
  if (user && !isOnboarding) {
    const { data: profile } = await supabase
      .from('users')
      .select('onboarding_profile')
      .eq('id', user.id)
      .single()

    const isComplete = profile?.onboarding_profile &&
      Object.keys(profile.onboarding_profile).length > 0

    if (!isComplete) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
