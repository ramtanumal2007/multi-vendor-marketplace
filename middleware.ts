import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { validateSupabaseConfig } from "@/lib/supabase-edge-guard";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "[CRITICAL SECURITY FAIL-CLOSED] Missing Supabase environment configuration in Edge middleware."
    );
    return new NextResponse(
      JSON.stringify({
        error: "Configuration Error",
        message: "Supabase environment is not properly configured.",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  // Fail-closed validation before Edge Supabase client instantiation
  try {
    validateSupabaseConfig(supabaseUrl);
  } catch (err: any) {
    console.error(
      "[CRITICAL SECURITY FAIL-CLOSED] Edge middleware blocked invalid Supabase configuration:",
      err?.message
    );
    return new NextResponse(
      JSON.stringify({
        error: "Security Configuration Error",
        message: "Invalid Supabase environment configuration.",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh auth token session
  // IMPORTANT: Do not run any code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Static asset extensions (.svg, .png, .jpg, .jpeg, .gif, .webp, .ico)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
