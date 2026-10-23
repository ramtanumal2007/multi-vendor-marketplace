import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/finance/payouts/[id]/fail
 * Records payout transfer failure and restores reserved balance to seller available balance.
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
    const failureReason = body.failureReason || body.failure_reason;
    const releaseFunds = body.releaseFunds !== undefined ? body.releaseFunds : (body.release_funds !== undefined ? body.release_funds : true);

    if (!failureReason || failureReason.trim().length === 0) {
      return NextResponse.json(
        { success: false, message: "A mandatory failure reason is required." },
        { status: 400 }
      );
    }

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("admin_fail_payout_transfer_atomic", {
      p_payout_id: payoutId,
      p_failure_reason: failureReason.trim(),
      p_release_funds: Boolean(releaseFunds),
    });

    if (rpcErr) {
      return NextResponse.json(
        { success: false, message: rpcErr.message || "Failed to record transfer failure." },
        { status: 400 }
      );
    }

    return NextResponse.json(rpcRes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
