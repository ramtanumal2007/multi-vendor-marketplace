import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { encryptAccountNumber } from "@/lib/bank-encryption";

export const dynamic = "force-dynamic";

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
              // Ignore in route handlers
            }
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const { data: accounts, error: rpcErr } = await supabase.rpc("get_seller_bank_accounts");

    if (rpcErr) {
      // Fallback query if RPC not yet run in active session
      const { data: fallbackAccounts, error: fallbackErr } = await supabase
        .from("seller_bank_accounts")
        .select("id, account_holder_name, bank_name, branch_name, ifsc_code, account_number_last4, account_type, is_primary, status, rejection_reason, correction_reason, admin_notes, verified_at, created_at")
        .eq("seller_id", user.id)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false });

      if (fallbackErr) {
        return NextResponse.json({ success: false, message: fallbackErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, accounts: fallbackAccounts || [] });
    }

    return NextResponse.json({ success: true, accounts: accounts || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      accountHolderName,
      bankName,
      branchName,
      ifscCode,
      accountNumber,
      accountType,
    } = body;

    if (!accountHolderName || !bankName || !ifscCode || !accountNumber) {
      return NextResponse.json(
        { success: false, message: "Please fill in all required fields." },
        { status: 400 }
      );
    }

    const cleanAccount = accountNumber.replace(/[^0-9]/g, "");
    if (cleanAccount.length < 9 || cleanAccount.length > 18) {
      return NextResponse.json(
        { success: false, message: "Invalid bank account number length. Expected 9 to 18 digits." },
        { status: 400 }
      );
    }

    const encryptedAccount = encryptAccountNumber(cleanAccount);
    const last4 = cleanAccount.slice(-4);

    const { data: result, error: rpcErr } = await supabase.rpc("add_seller_bank_account", {
      p_account_holder_name: accountHolderName,
      p_bank_name: bankName,
      p_branch_name: branchName || "",
      p_ifsc_code: ifscCode,
      p_encrypted_account_number: encryptedAccount,
      p_account_number_last4: last4,
      p_account_type: accountType || "CURRENT",
    });

    if (rpcErr) {
      return NextResponse.json(
        { success: false, message: rpcErr.message || "Failed to add bank account." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message || "Bank account submitted for verification.",
      account: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
