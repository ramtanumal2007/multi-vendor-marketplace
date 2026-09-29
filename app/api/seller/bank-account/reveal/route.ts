import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { decryptAccountNumber } from "@/lib/bank-encryption";

export const dynamic = "force-dynamic";

/**
 * POST /api/seller/bank-account/reveal
 * Privileged endpoint for an authenticated Seller to securely reveal their OWN bank account number.
 * Cross-seller access is strictly prevented (seller_id must match auth.uid).
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

    // 1. Authenticate Seller
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const { accountId } = body;

    if (!accountId) {
      return NextResponse.json(
        { success: false, message: "Missing accountId parameter." },
        { status: 400 }
      );
    }

    // 2. Fetch account strictly scoped to auth.uid() to prevent cross-seller access
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: account, error: accErr } = await supabaseAdmin
      .from("seller_bank_accounts")
      .select("id, seller_id, bank_name, account_number_last4, encrypted_account_number")
      .eq("id", accountId)
      .eq("seller_id", user.id) // Critical ownership check
      .maybeSingle();

    if (accErr || !account) {
      return NextResponse.json(
        { success: false, message: "Bank account not found or access denied." },
        { status: 404 }
      );
    }

    // 3. Decrypt AES-256-GCM payload server-side
    let fullAccountNumber = "";
    try {
      fullAccountNumber = decryptAccountNumber(account.encrypted_account_number);
    } catch (decryptErr) {
      console.error("Seller bank decryption error:", decryptErr);
      return NextResponse.json(
        { success: false, message: "Failed to securely decrypt account number." },
        { status: 500 }
      );
    }

    // 4. Audit Log (Never log the decrypted full account number!)
    try {
      await supabaseAdmin.from("finance_audit_logs").insert({
        actor_id: user.id,
        action_type: "BANK_ACCOUNT_FULL_NUMBER_VIEWED",
        target_entity: "seller_bank_accounts",
        target_id: account.id,
        notes: `Seller viewed own full bank account number for ${account.bank_name} (ending in ${account.account_number_last4}).`,
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
