import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createSupabaseAdminClient } from "@/lib/supabase";
import { adminManualCreditWallet } from "@/lib/wallet-service";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  try {
    const cookieStore = cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user },
      error: authErr,
    } = await supabaseUser.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Admin access required." }, { status: 403 });
    }

    // Fetch recent admin manual adjustments from wallet_transactions
    const { data: txs, error: txErr } = await supabaseAdmin
      .from("wallet_transactions")
      .select("*, customer_wallets(*)")
      .eq("type", "ADMIN_ADJUSTMENT")
      .order("created_at", { ascending: false })
      .limit(50);

    if (txErr) {
      return NextResponse.json({ success: false, message: txErr.message }, { status: 500 });
    }

    // Fetch recent admin manual adjustments from seller_ledger_entries
    const { data: sellerTxs } = await supabaseAdmin
      .from("seller_ledger_entries")
      .select("*")
      .eq("entry_type", "ADMIN_ADJUSTMENT")
      .order("created_at", { ascending: false })
      .limit(50);

    // Enrich with recipient names
    const recipientIds = Array.from(
      new Set([
        ...(txs || []).map((t) => t.customer_id),
        ...(sellerTxs || []).map((s) => s.seller_id),
      ])
    );
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, role")
      .in("id", recipientIds);

    const { data: sellerProfiles } = await supabaseAdmin
      .from("seller_profiles")
      .select("id, business_name, contact_name, business_email")
      .in("id", recipientIds);

    const profMap = new Map((profiles || []).map((p) => [p.id, p]));
    const sellerMap = new Map((sellerProfiles || []).map((s) => [s.id, s]));

    const customerEnriched = (txs || []).map((tx) => {
      const seller = sellerMap.get(tx.customer_id);
      const prof = profMap.get(tx.customer_id);

      return {
        id: tx.id,
        walletId: tx.wallet_id,
        recipientId: tx.customer_id,
        recipientType: seller ? "seller" : prof?.role === "seller" ? "seller" : "customer",
        recipientName: seller?.business_name || prof?.full_name || prof?.email || "Account Holder",
        recipientEmail: seller?.business_email || prof?.email,
        amount: Number(tx.amount),
        direction: tx.direction,
        balanceAfter: Number(tx.balance_after),
        description: tx.description,
        idempotencyKey: tx.idempotency_key,
        createdAt: tx.created_at,
        referenceId: tx.reference_id,
      };
    });

    const sellerEnriched = (sellerTxs || []).map((stx) => {
      const seller = sellerMap.get(stx.seller_id);
      const prof = profMap.get(stx.seller_id);

      return {
        id: stx.id,
        walletId: null,
        recipientId: stx.seller_id,
        recipientType: "seller" as const,
        recipientName: seller?.business_name || prof?.full_name || prof?.email || "Seller Account",
        recipientEmail: seller?.business_email || prof?.email,
        amount: Number(stx.amount_paise) / 100,
        direction: stx.direction,
        balanceAfter: Number(stx.available_balance_after_paise) / 100,
        description: stx.description,
        idempotencyKey: stx.idempotency_key,
        createdAt: stx.created_at,
        referenceId: stx.actor_id,
      };
    });

    const allAdjustments = [...customerEnriched, ...sellerEnriched]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);

    return NextResponse.json({ success: true, transactions: allAdjustments });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user },
      error: authErr,
    } = await supabaseUser.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify admin role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, email, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { recipientType, recipientId, amount, reason, idempotencyKey } = body;

    if (!recipientType || !["customer", "seller"].includes(recipientType)) {
      return NextResponse.json(
        { success: false, message: "Recipient type must be either 'customer' or 'seller'." },
        { status: 400 }
      );
    }

    if (!recipientId) {
      return NextResponse.json({ success: false, message: "Recipient ID is required." }, { status: 400 });
    }

    const result = await adminManualCreditWallet(supabaseAdmin, {
      recipientType,
      recipientId,
      amount,
      reason,
      adminUserId: user.id,
      adminEmail: user.email || profile?.email || profile?.full_name || "Admin",
      idempotencyKey,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }

    return NextResponse.json({
      ...result,
      message: result.isDuplicate
        ? "Operation was previously completed (idempotent result returned)."
        : `Successfully credited ₹${result.amount?.toFixed(2)} to ${result.recipientName}'s wallet.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
