import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * POST /api/seller/payouts/request
 * Validates seller identity, amount (min â‚¹10, max available balance),
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

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: "Invalid request body." },
        { status: 400 }
      );
    }

    const {
      amount,
      destinationType: rawDestinationType,
      bankAccountId: rawBankAccountId,
      idempotencyKey: rawIdempotencyKey,
    } = body as Record<string, unknown>;

    if (typeof amount !== "number" && typeof amount !== "string") {
      return NextResponse.json(
        { success: false, message: "Invalid payout amount." },
        { status: 400 }
      );
    }

    const numAmount = Number(amount);

    if (!Number.isFinite(numAmount) || numAmount < 10) {
      return NextResponse.json(
        { success: false, message: "Minimum payout request amount is ₹10.00." },
        { status: 400 }
      );
    }

    const destinationType =
      typeof rawDestinationType === "string"
        ? rawDestinationType.trim().toUpperCase()
        : "";

    if (!["BANK_ACCOUNT", "UPI"].includes(destinationType)) {
      return NextResponse.json(
        { success: false, message: "Please select a valid payout destination." },
        { status: 400 }
      );
    }

    if (
      rawBankAccountId !== undefined &&
      rawBankAccountId !== null &&
      typeof rawBankAccountId !== "string"
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid bank account ID." },
        { status: 400 }
      );
    }

    const bankAccountId =
      typeof rawBankAccountId === "string" && rawBankAccountId.trim()
        ? rawBankAccountId.trim()
        : null;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (
      destinationType === "BANK_ACCOUNT" &&
      bankAccountId !== null &&
      !uuidPattern.test(bankAccountId)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid bank account ID format." },
        { status: 400 }
      );
    }

    if (
      typeof rawIdempotencyKey !== "string" ||
      rawIdempotencyKey.trim().length < 8 ||
      rawIdempotencyKey.trim().length > 200 ||
      !/^[A-Za-z0-9_-]+$/.test(rawIdempotencyKey.trim())
    ) {
      return NextResponse.json(
        { success: false, message: "A valid idempotency key is required." },
        { status: 400 }
      );
    }

    const idempotencyKey = rawIdempotencyKey.trim();

    // Call atomic PostgreSQL RPC as authenticated user
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("request_seller_payout_atomic", {
      p_amount_rupees: numAmount,
      p_destination_type: destinationType,
      p_bank_account_id: destinationType === "BANK_ACCOUNT" ? bankAccountId : null,
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

