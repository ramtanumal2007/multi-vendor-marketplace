import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";
import { decryptAccountNumber } from "@/lib/bank-encryption";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/finance/payouts/[id]/reveal
 * Dedicated authenticated Admin-only endpoint to reveal full bank account number
 * for the exact bank destination linked to a specific payout request.
 * Enforces server-side authorization, verifies ownership of the bank account,
 * decrypts AES-256-GCM ciphertext on the server, and records an audit log entry.
 */
export async function POST(
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

    // 3. Fetch payout request
    const { data: payout, error: payErr } = await supabaseAdmin
      .from("seller_payout_requests")
      .select("id, payout_number, seller_id, destination_type, bank_account_id, destination_snapshot")
      .eq("id", payoutId)
      .maybeSingle();

    if (payErr || !payout) {
      return NextResponse.json({ success: false, message: "Payout request not found." }, { status: 404 });
    }

    if (payout.destination_type !== "BANK_ACCOUNT") {
      return NextResponse.json(
        { success: false, message: "Payout request destination is not a bank account." },
        { status: 400 }
      );
    }

    const targetBankAccountId =
      payout.bank_account_id ||
      (payout.destination_snapshot as Record<string, unknown> | null)?.bank_account_id;

    if (!targetBankAccountId) {
      return NextResponse.json(
        { success: false, message: "No bank account ID linked to this payout request." },
        { status: 404 }
      );
    }

    // 4. Fetch encrypted account details confirming it belongs to this seller
    const { data: account, error: accErr } = await supabaseAdmin
      .from("seller_bank_accounts")
      .select("id, seller_id, bank_name, branch_name, account_number_last4, encrypted_account_number, status")
      .eq("id", targetBankAccountId)
      .eq("seller_id", payout.seller_id)
      .maybeSingle();

    if (accErr || !account) {
      return NextResponse.json(
        { success: false, message: "Linked bank account not found or does not belong to this seller." },
        { status: 404 }
      );
    }

    // 5. Decrypt AES-256-GCM ciphertext
    let fullAccountNumber = "";
    try {
      fullAccountNumber = decryptAccountNumber(account.encrypted_account_number);
    } catch {
      return NextResponse.json(
        { success: false, message: "Failed to securely decrypt account number." },
        { status: 500 }
      );
    }

    // 6. Record Audit Log (Never log decrypted full account number!)
    try {
      await supabaseAdmin.from("finance_audit_logs").insert({
        actor_id: user.id,
        action_type: "PAYOUT_BANK_FULL_ACCOUNT_REVEALED",
        target_entity: "seller_payout_requests",
        target_id: payout.id,
        notes: `Admin viewed full account number for payout ${payout.payout_number} (bank ${account.bank_name}, ending in ${account.account_number_last4}).`,
      });
    } catch (auditErr) {
      console.warn("Audit log notice:", auditErr);
    }

    return NextResponse.json({
      success: true,
      payoutId: payout.id,
      bankAccountId: account.id,
      bankName: account.bank_name,
      branchName: account.branch_name,
      accountNumberLast4: account.account_number_last4,
      status: account.status,
      fullAccountNumber,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
