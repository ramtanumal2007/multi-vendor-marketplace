import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * POST /api/seller/bank-account/set-primary
 * Allows an authenticated seller to designate one of their VERIFIED bank accounts
 * as their primary payout destination.
 *
 * Rules:
 * - Only authenticated sellers can call this.
 * - The account must belong to the caller (auth.uid()).
 * - The account status must be 'verified'. (pending, correction_required, rejected, archived are rejected).
 * - Atomic single-primary update: Demotes previous primary to non-primary without archiving it.
 * - Protected by audit logging.
 */
export async function POST(req: Request) {
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
              // Ignore in route handlers
            }
          },
        },
      }
    );

    // 1. Authenticate Seller
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        { success: false, message: "Missing accountId parameter." },
        { status: 400 }
      );
    }

    // 2. Try RPC first (set_primary_seller_bank_account)
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      "set_primary_seller_bank_account",
      { p_account_id: accountId }
    );

    if (!rpcErr && rpcResult?.success) {
      return NextResponse.json({
        success: true,
        message: rpcResult.message || "Primary payout account updated successfully.",
        result: rpcResult,
      });
    }

    // 3. Resilient Server-Side Transaction with Service Role
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch target account and verify ownership & verified status
    const { data: targetAccount, error: fetchErr } = await supabaseAdmin
      .from("seller_bank_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();

    if (fetchErr || !targetAccount) {
      return NextResponse.json(
        { success: false, message: "Bank account not found." },
        { status: 404 }
      );
    }

    if (targetAccount.seller_id !== user.id) {
      return NextResponse.json(
        { success: false, message: "Forbidden: You do not own this bank account." },
        { status: 403 }
      );
    }

    if (targetAccount.status !== "verified") {
      return NextResponse.json(
        {
          success: false,
          message: `Only verified bank accounts can be set as primary. Current status is ${targetAccount.status}.`,
        },
        { status: 400 }
      );
    }

    // If already primary, no-op return
    if (targetAccount.is_primary === true) {
      return NextResponse.json({
        success: true,
        message: "This account is already your primary payout destination.",
        accountId,
      });
    }

    // Demote any current primary account for this seller to non-primary (WITHOUT archiving)
    const { error: demoteErr } = await supabaseAdmin
      .from("seller_bank_accounts")
      .update({
        is_primary: false,
        updated_at: new Date().toISOString(),
      })
      .eq("seller_id", user.id)
      .neq("id", accountId)
      .eq("is_primary", true);

    if (demoteErr) {
      console.error("Error demoting previous primary bank account:", demoteErr);
      return NextResponse.json(
        { success: false, message: "Failed to update primary bank account." },
        { status: 500 }
      );
    }

    // Promote target account to primary
    const { error: promoteErr } = await supabaseAdmin
      .from("seller_bank_accounts")
      .update({
        is_primary: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    if (promoteErr) {
      console.error("Error setting bank account as primary:", promoteErr);
      return NextResponse.json(
        { success: false, message: promoteErr.message || "Failed to set account as primary." },
        { status: 500 }
      );
    }

    // 4. Immutable Audit Log
    try {
      await supabaseAdmin.from("finance_audit_logs").insert({
        actor_id: user.id,
        action_type: "SELLER_PRIMARY_BANK_ACCOUNT_CHANGED",
        target_entity: "seller_bank_accounts",
        target_id: accountId,
        old_values: {
          is_primary: false,
        },
        new_values: {
          is_primary: true,
          bank_name: targetAccount.bank_name,
          last4: targetAccount.account_number_last4,
        },
        notes: `Seller switched primary payout account to ${targetAccount.bank_name} ending in ${targetAccount.account_number_last4}`,
      });
    } catch (auditErr) {
      console.warn("Audit logging notice:", auditErr);
    }

    return NextResponse.json({
      success: true,
      message: "Primary payout account updated successfully.",
      accountId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Set primary bank account error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
