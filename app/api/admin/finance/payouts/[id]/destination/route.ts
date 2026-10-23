import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";
import { getAdminPayoutDetails } from "@/lib/admin-finance-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance/payouts/[id]/destination
 * Dedicated authenticated Admin-only endpoint for sensitive financial destination details.
 * Enforces admin authorization server-side and confirms the requested destination
 * belongs to the seller and payout request.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
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

    // 1. Authenticate Caller
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    // 2. Authorize Admin Role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Forbidden: Admin access required." },
        { status: 403 }
      );
    }

    const payoutId = params.id;
    if (!payoutId) {
      return NextResponse.json({ success: false, message: "Missing payout ID." }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const details = await getAdminPayoutDetails(supabaseAdmin, payoutId);
    if (!details || !details.payout) {
      return NextResponse.json({ success: false, message: "Payout request not found." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      payoutId,
      destination: details.destination_details,
      payout: {
        id: details.payout.id,
        payout_number: details.payout.payout_number,
        seller_id: details.payout.seller_id,
        amount: details.payout.amount,
        amount_paise: details.payout.amount_paise,
        destination_type: details.payout.destination_type,
        bank_account_id: details.payout.bank_account_id,
        status: details.payout.status,
        requested_at: details.payout.requested_at,
        approved_at: details.payout.approved_at,
        paid_at: details.payout.paid_at,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
