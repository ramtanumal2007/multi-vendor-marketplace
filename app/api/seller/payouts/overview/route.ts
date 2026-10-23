import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";
import { getSellerFinancialSummary, getVerifiedSellerDestinations } from "@/lib/settlement-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/seller/payouts/overview
 * Returns seller's authoritative financial summary and verified payout destinations.
 */
export async function GET() {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // ignore
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const [summary, destinations] = await Promise.all([
      getSellerFinancialSummary(supabaseAdmin, user.id),
      getVerifiedSellerDestinations(supabaseAdmin, user.id),
    ]);

    return NextResponse.json({
      success: true,
      summary,
      destinations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
