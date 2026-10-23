import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Scheduled Cron Endpoint: Process Maturing Seller Settlement Holds
 * Releases 7-day held funds where hold_until <= NOW() and conditions are met.
 * Strictly protected by CRON_SECRET.
 * Supports GET (Vercel Cron) and POST (External Webhooks / Schedulers).
 */
async function handleSettlementHoldRelease(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecretHeader = req.headers.get("x-cron-secret");
    const configuredSecret = process.env.CRON_SECRET;

    if (!configuredSecret) {
      console.error("Cron Error: CRON_SECRET is not configured in server environment.");
      return NextResponse.json(
        { success: false, error: "Server configuration error: CRON_SECRET is missing." },
        { status: 500 }
      );
    }

    const isBearerValid = authHeader === `Bearer ${configuredSecret}`;
    const isHeaderValid = cronSecretHeader === configuredSecret;

    if (!isBearerValid && !isHeaderValid) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid or missing cron secret." },
        { status: 401 }
      );
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Call atomic hold releases procedure
    const { data: result, error: rpcErr } = await supabaseAdmin.rpc(
      "process_settlement_hold_releases_atomic"
    );

    if (rpcErr) {
      console.error("Cron Error: process_settlement_hold_releases_atomic failed:", rpcErr);
      return NextResponse.json(
        { success: false, error: rpcErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Settlement hold releases processed successfully.",
      timestamp: new Date().toISOString(),
      result: result ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Cron Error in settlement-holds route:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handleSettlementHoldRelease(req);
}

export async function POST(req: Request) {
  return handleSettlementHoldRelease(req);
}
