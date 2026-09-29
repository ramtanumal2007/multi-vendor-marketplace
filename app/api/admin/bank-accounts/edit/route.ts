import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { encryptAccountNumber } from "@/lib/bank-encryption";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bank-accounts/edit
 * Privileged endpoint for Marketplace Admin to edit seller payout bank details.
 *
 * CRITICAL SECURITY RULE:
 * If Admin edits a VERIFIED account, it is immediately invalidated and reset to PENDING.
 * is_primary is set to false, verified_at/verified_by are cleared, and re-approval is required.
 * Full audit record is stored in finance_audit_logs with old and new values.
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

    // 1. Authenticate Admin
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

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
    const {
      accountId,
      accountHolderName,
      bankName,
      branchName,
      ifscCode,
      accountType,
      accountNumber,
      adminNote,
    } = body;

    if (!accountId) {
      return NextResponse.json(
        { success: false, message: "Missing accountId parameter." },
        { status: 400 }
      );
    }

    if (!accountHolderName || !bankName || !ifscCode) {
      return NextResponse.json(
        { success: false, message: "Account holder name, bank name, and IFSC code are required." },
        { status: 400 }
      );
    }

    const cleanIfsc = String(ifscCode).trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      return NextResponse.json(
        { success: false, message: "Invalid IFSC code format (Expected 11 characters, 5th character must be zero)." },
        { status: 400 }
      );
    }

    const validAccountType = accountType === "SAVINGS" ? "SAVINGS" : "CURRENT";

    // 2. Fetch existing account record
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: existingAccount, error: fetchErr } = await supabaseAdmin
      .from("seller_bank_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();

    if (fetchErr || !existingAccount) {
      return NextResponse.json(
        { success: false, message: "Bank account not found." },
        { status: 404 }
      );
    }

    // 3. Handle Account Number encryption if changed/provided
    let newEncrypted: string | null = null;
    let newLast4: string | null = null;

    if (accountNumber && typeof accountNumber === "string" && accountNumber.trim().length > 0) {
      const cleanAcc = accountNumber.replace(/[^0-9]/g, "");
      if (cleanAcc.length < 9 || cleanAcc.length > 18) {
        return NextResponse.json(
          { success: false, message: "Bank account number must be between 9 and 18 digits." },
          { status: 400 }
        );
      }

      newEncrypted = encryptAccountNumber(cleanAcc);
      newLast4 = cleanAcc.slice(-4);
    }

    const wasVerified = existingAccount.status === "verified";

    // 4. Critical Security Rule:
    // Any admin edit resets account to 'pending', clears primary flag, clears verification stamps.
    const updatedStatus = "pending";
    const updatedIsPrimary = false;
    const finalEncrypted = newEncrypted || existingAccount.encrypted_account_number;
    const finalLast4 = newLast4 || existingAccount.account_number_last4;

    const { error: updateErr } = await supabaseAdmin
      .from("seller_bank_accounts")
      .update({
        account_holder_name: accountHolderName.trim(),
        bank_name: bankName.trim(),
        branch_name: branchName ? branchName.trim() : "",
        ifsc_code: cleanIfsc,
        account_type: validAccountType,
        encrypted_account_number: finalEncrypted,
        account_number_last4: finalLast4,
        status: updatedStatus,
        is_primary: updatedIsPrimary,
        verified_at: null,
        verified_by: null,
        correction_reason: null,
        rejection_reason: null,
        admin_notes: adminNote?.trim() || existingAccount.admin_notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    if (updateErr) {
      console.error("Error updating seller bank account:", updateErr);
      return NextResponse.json(
        { success: false, message: updateErr.message || "Failed to update bank account." },
        { status: 500 }
      );
    }

    // 5. Immutable Audit Log
    try {
      await supabaseAdmin.from("finance_audit_logs").insert({
        actor_id: user.id,
        action_type: wasVerified
          ? "BANK_ACCOUNT_VERIFIED_INVALIDATED_TO_PENDING"
          : "BANK_ACCOUNT_EDITED_BY_ADMIN",
        target_entity: "seller_bank_accounts",
        target_id: accountId,
        old_values: {
          status: existingAccount.status,
          is_primary: existingAccount.is_primary,
          account_holder_name: existingAccount.account_holder_name,
          bank_name: existingAccount.bank_name,
          branch_name: existingAccount.branch_name,
          ifsc_code: existingAccount.ifsc_code,
          account_type: existingAccount.account_type,
          last4: existingAccount.account_number_last4,
          verified_at: existingAccount.verified_at,
          verified_by: existingAccount.verified_by,
        },
        new_values: {
          status: updatedStatus,
          is_primary: updatedIsPrimary,
          account_holder_name: accountHolderName.trim(),
          bank_name: bankName.trim(),
          branch_name: branchName ? branchName.trim() : "",
          ifsc_code: cleanIfsc,
          account_type: validAccountType,
          last4: finalLast4,
          account_number_changed: Boolean(newEncrypted),
        },
        notes:
          adminNote?.trim() ||
          (wasVerified
            ? "Admin edited verified bank details. Verification invalidated and reset to pending review; re-approval required."
            : "Admin updated bank account details."),
      });
    } catch (auditErr) {
      console.warn("Audit log notice:", auditErr);
    }

    // 6. In-App Notification to Seller
    try {
      await supabaseAdmin.from("seller_notifications").insert({
        seller_id: existingAccount.seller_id,
        title: "Bank Account Details Updated by Admin",
        message: wasVerified
          ? `Your bank account (${bankName.trim()} ending in ${finalLast4}) details were modified by administration. The account has been placed under pending review and will be re-verified shortly.`
          : `Your bank account (${bankName.trim()} ending in ${finalLast4}) details were updated by administration and are under pending review.`,
        type: "system",
        priority: "high",
        link_url: "/seller/bank-account",
      });
    } catch (notifErr) {
      console.warn("Seller notification notice:", notifErr);
    }

    return NextResponse.json({
      success: true,
      message: wasVerified
        ? "Bank account details saved. Previous verification has been invalidated and the account is set to PENDING review."
        : "Bank account details updated successfully.",
      status: updatedStatus,
      isPrimary: updatedIsPrimary,
      last4: finalLast4,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
