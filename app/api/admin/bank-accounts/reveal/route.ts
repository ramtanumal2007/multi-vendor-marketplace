import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { decryptAccountNumber } from "@/lib/bank-encryption";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bank-accounts/reveal
 * Privileged endpoint for Marketplace Admin to securely reveal full bank account number.
 * Decrypts AES-256-GCM ciphertext on server and writes immutable record to finance_audit_logs.
 * The full account number is NEVER recorded in audit logs or query strings.
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

    const body = await req.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        { success: false, message: "Missing accountId parameter." },
        { status: 400 }
      );
    }

    // 3. Fetch encrypted account details using privileged client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: account, error: accErr } = await supabaseAdmin
      .from("seller_bank_accounts")
      .select("id, seller_id, bank_name, account_number_last4, encrypted_account_number")
      .eq("id", accountId)
      .maybeSingle();

    if (accErr || !account) {
      return NextResponse.json(
        { success: false, message: "Bank account not found." },
        { status: 404 }
      );
    }

    // 4. Decrypt AES-256-GCM payload server-side
    let fullAccountNumber = "";
    try {
      fullAccountNumber = decryptAccountNumber(account.encrypted_account_number);
    } catch (decryptErr) {
      console.error("Bank decryption error:", decryptErr);
      return NextResponse.json(
        { success: false, message: "Failed to securely decrypt account number." },
        { status: 500 }
      );
    }

    // 5. Audit Log (Never log the decrypted full account number!)
    try {
      await supabaseAdmin.from("finance_audit_logs").insert({
        actor_id: user.id,
        action_type: "BANK_ACCOUNT_FULL_NUMBER_VIEWED",
        target_entity: "seller_bank_accounts",
        target_id: account.id,
        notes: `Admin viewed full account number for bank ${account.bank_name} (ending in ${account.account_number_last4}).`,
      });
    } catch (auditErr) {
      console.warn("Audit log notice:", auditErr);
    }

    return NextResponse.json({
      success: true,
      fullAccountNumber,
      last4: account.account_number_last4,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
