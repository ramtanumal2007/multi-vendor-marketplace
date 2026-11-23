import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createSupabaseAdminClient } from "@/lib/supabase";
import { getSellerFinancialSummary, getSellerLedgerEntries } from "@/lib/settlement-service";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/seller/wallet
 * Returns current authenticated seller's balance and ledger transaction log from authoritative seller financial tables.
 * Enforces seller role authorization and session ownership.
 */
export async function GET() {
  try {
    const cookieStore = cookies();
    const supabaseUser = createServerClient(
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
            } catch {}
          },
        },
      }
    );

    const {
      data: { user },
      error: authErr,
    } = await supabaseUser.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized. Please login to Seller Hub." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify authenticated user is a verified or registered seller
    const { data: sellerProfile } = await supabaseAdmin
      .from("seller_profiles")
      .select("id, business_name, verification_status")
      .eq("id", user.id)
      .maybeSingle();

    if (!sellerProfile) {
      // Check if user has role=seller in profiles
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (prof?.role !== "seller" && prof?.role !== "admin") {
        return NextResponse.json({ success: false, message: "Seller account authorization required." }, { status: 403 });
      }
    }

    // Authoritative Seller Financial Summary & Ledger
    const [summary, entries] = await Promise.all([
      getSellerFinancialSummary(supabaseAdmin, user.id),
      getSellerLedgerEntries(supabaseAdmin, user.id, 50),
    ]);

    return NextResponse.json({
      success: true,
      businessName: sellerProfile?.business_name || "Merchant Store",
      summary,
      transactions: entries,
      wallet: {
        balance: summary.available_to_withdraw,
        pending_balance: summary.pending_settlement,
        locked_balance: summary.reserved_for_payout,
        lifetime_earned: summary.gross_product_sales,
        lifetime_withdrawn: summary.total_paid_to_seller,
        currency: "INR",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
