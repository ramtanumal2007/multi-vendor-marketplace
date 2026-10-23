import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/finance/payouts/[id]/reopen
 * Reopens a rejected or failed payout request for administrative re-evaluation.
 * Atomically re-verifies seller available balance and reserves funds back into locked balance.
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
    const reason = body.reason || body.reopen_reason || body.reopenReason;
    const adminNotes = body.notes || body.admin_notes || body.adminNotes;

    if (!reason || typeof reason !== "string" || reason.trim().length < 3) {
      return NextResponse.json(
        { success: false, message: "A mandatory justification reason (at least 3 characters) is required to reopen this request." },
        { status: 400 }
      );
    }

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("admin_reopen_payout_request_atomic", {
      p_payout_id: payoutId,
      p_reason: reason.trim(),
      p_admin_notes: adminNotes ? adminNotes.trim() : null,
    });

    if (rpcErr) {
      return NextResponse.json(
        { success: false, message: rpcErr.message || "Failed to reopen payout request." },
        { status: 400 }
      );
    }

    return NextResponse.json(rpcRes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
