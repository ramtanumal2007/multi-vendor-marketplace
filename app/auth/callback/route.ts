import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/'
  const sanitizedNext = (next === '/seller' || next === '/seller/onboarding' || next.startsWith('/seller/')) ? '/' : next

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Ignore in Route Handler
          }
        },
      },
    }
  )

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Ensure sellers are NEVER auto-redirected to /seller or /seller/onboarding
      return NextResponse.redirect(`${origin}${sanitizedNext}`)
    }
  }

  // If code exchange failed (e.g. single-use PKCE code already consumed when user pressed Back button),
  // check if an active authenticated session already exists:
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    return NextResponse.redirect(`${origin}${sanitizedNext}`)
  }

  // return the user to an error page only if no active session exists
  return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`)
}
