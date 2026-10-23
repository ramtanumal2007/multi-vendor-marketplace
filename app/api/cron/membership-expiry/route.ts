import { createAdminClient } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Scheduled Daily Cron Job for Processing Expired Memberships
 * Can be triggered via Vercel Cron, external scheduler, or admin webhook.
 * Protected by CRON_SECRET or administrative service authorization.
 */
export async function GET(req: Request) {
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
      return NextResponse.json({ success: false, error: "Unauthorized: Invalid cron secret." }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Call privileged batch function
    const { data: result, error: rpcErr } = await supabaseAdmin.rpc("process_all_expired_memberships");

    if (rpcErr) {
      console.error("Cron membership expiry processing failed:", rpcErr);
      return NextResponse.json({ success: false, error: rpcErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Daily membership expiry batch processed successfully.",
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Cron membership expiry error:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
