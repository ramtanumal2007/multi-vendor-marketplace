import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * POST /api/seller/payouts/request
 * Validates seller identity, amount (min ₹10, max available balance),
 * and executes atomic reservation RPC.
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
              // ignore
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const { amount, destinationType, bankAccountId, idempotencyKey } = body;

    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount < 10) {
      return NextResponse.json(
        { success: false, message: "Minimum payout request amount is ₹10.00." },
        { status: 400 }
      );
    }

    if (!destinationType || !["BANK_ACCOUNT", "UPI"].includes(destinationType)) {
      return NextResponse.json(
        { success: false, message: "Please select a valid payout destination (Bank Account or UPI)." },
        { status: 400 }
      );
    }

    // Call atomic PostgreSQL RPC as authenticated user
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("request_seller_payout_atomic", {
      p_amount_rupees: numAmount,
      p_destination_type: destinationType,
      p_bank_account_id: bankAccountId || null,
      p_idempotency_key: idempotencyKey || null,
    });

    if (rpcErr) {
      console.error("Payout request RPC error:", rpcErr);
      return NextResponse.json(
        { success: false, message: rpcErr.message || "Failed to submit payout request." },
        { status: 400 }
      );
    }

    return NextResponse.json(rpcRes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
