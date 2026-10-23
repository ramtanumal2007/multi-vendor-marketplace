import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/finance/payouts/[id]/confirm-transfer
 * Records actual manual transfer details (UTR, method, transfer date/time in Asia/Kolkata),
 * updates payout status to 'paid', decrements locked balance, and updates seller lifetime withdrawn.
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
      return NextResponse.json({ success: false, message: "Forbidden: Admin access required." }, { status: 403 });
    }

    const payoutId = params.id;
    const body = await req.json();
    const transferMethod = body.transferMethod || body.transfer_method;
    const utrReference = body.utrReference || body.utr_reference;
    const transferDate = body.transferDate || body.actual_transfer_date;
    const transferTime = body.transferTime || body.actual_transfer_time;
    const adminNotes = body.adminNotes || body.admin_notes;
    const inputAmount = body.transferred_amount !== undefined ? body.transferred_amount : (body.transferredAmount !== undefined ? body.transferredAmount : body.amount);

    // Fetch authoritative payout request to verify amount and destination credentials
    const { data: payout, error: payoutErr } = await supabase
      .from("seller_payout_requests")
      .select("id, amount, status, seller_id, destination_type, bank_account_id, destination_snapshot")
      .eq("id", payoutId)
      .maybeSingle();

    if (payoutErr || !payout) {
      return NextResponse.json({ success: false, message: "Payout request not found." }, { status: 404 });
    }

    if (!["approved", "processing"].includes(payout.status)) {
      return NextResponse.json(
        { success: false, message: `Cannot confirm transfer for payout in ${payout.status} state. Must be approved or processing.` },
        { status: 400 }
      );
    }

    // Safety check: verify payout destination credentials before transfer
    if (payout.destination_type === "BANK_ACCOUNT") {
      const targetBankId =
        payout.bank_account_id ||
        (payout.destination_snapshot as Record<string, unknown> | null)?.bank_account_id;

      if (!targetBankId) {
        return NextResponse.json(
          { success: false, message: "Cannot confirm transfer: Payout request has no linked bank account." },
          { status: 400 }
        );
      }

      const { data: bankAcc } = await supabase
        .from("seller_bank_accounts")
        .select("id, status")
        .eq("id", targetBankId)
        .eq("seller_id", payout.seller_id)
        .maybeSingle();

      if (!bankAcc) {
        return NextResponse.json(
          { success: false, message: "Cannot confirm transfer: Linked bank account not found or does not belong to this seller." },
          { status: 400 }
        );
      }

      if (bankAcc.status !== "verified") {
        return NextResponse.json(
          { success: false, message: `Cannot confirm transfer: Linked bank account is ${bankAcc.status.toUpperCase()}. Only verified bank destinations may receive payouts.` },
          { status: 400 }
        );
      }
    } else if (payout.destination_type === "UPI") {
      const snapUpi = (payout.destination_snapshot as Record<string, unknown> | null)?.upi_id;
      if (!snapUpi || typeof snapUpi !== "string" || !snapUpi.trim()) {
        return NextResponse.json(
          { success: false, message: "Cannot confirm transfer: Payout request has no valid registered UPI ID." },
          { status: 400 }
        );
      }
    }

    if (inputAmount !== undefined && inputAmount !== null) {
      const numInput = Number(inputAmount);
      if (isNaN(numInput) || Math.abs(numInput - Number(payout.amount)) > 0.01) {
        return NextResponse.json(
          {
            success: false,
            message: `Transferred amount (₹${numInput.toFixed(2)}) must exactly equal the approved payout amount (₹${Number(payout.amount).toFixed(2)}). Partial transfers are not permitted.`,
          },
          { status: 400 }
        );
      }
    }

    if (!transferMethod || !["BANK_TRANSFER", "UPI"].includes(transferMethod.toUpperCase())) {
      return NextResponse.json(
        { success: false, message: "Please specify a valid transfer method (BANK_TRANSFER or UPI)." },
        { status: 400 }
      );
    }

    const cleanUtr = (utrReference || "").trim().toUpperCase();
    if (cleanUtr.length < 6) {
      return NextResponse.json(
        { success: false, message: "Please provide a valid UTR / transaction reference (at least 6 characters)." },
        { status: 400 }
      );
    }

    if (!transferDate) {
      return NextResponse.json(
        { success: false, message: "Actual transfer date is required." },
        { status: 400 }
      );
    }

    const cleanTime = transferTime ? transferTime.trim() : "12:00:00";

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("admin_confirm_payout_transfer_atomic", {
      p_payout_id: payoutId,
      p_transfer_method: transferMethod.toUpperCase(),
      p_utr_reference: cleanUtr,
      p_transfer_date: transferDate,
      p_transfer_time: cleanTime,
      p_admin_notes: adminNotes ? adminNotes.trim() : null,
    });

    if (rpcErr) {
      console.error("Confirm payout transfer RPC error:", rpcErr);
      return NextResponse.json(
        { success: false, message: rpcErr.message || "Failed to confirm payout transfer." },
        { status: 400 }
      );
    }

    return NextResponse.json(rpcRes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
