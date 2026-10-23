import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/finance/payouts/[id]/review
 * Approves or rejects a payout request atomically.
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
    const rawAction = body.action || "";
    const action = typeof rawAction === "string" ? rawAction.toUpperCase() : "";
    const reason = body.reason || body.rejection_reason || body.rejectionReason;
    const notes = body.notes || body.admin_notes || body.adminNotes;

    if (!action || !["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json(
        { success: false, message: "Action must be either APPROVE or REJECT." },
        { status: 400 }
      );
    }

    if (action.toUpperCase() === "REJECT" && (!reason || reason.trim().length === 0)) {
      return NextResponse.json(
        { success: false, message: "A mandatory rejection reason is required." },
        { status: 400 }
      );
    }

    const { data: rpcRes, error: rpcErr } = await supabase.rpc("admin_review_payout_request_atomic", {
      p_payout_id: payoutId,
      p_action: action.toUpperCase(),
      p_reason: reason ? reason.trim() : null,
      p_admin_notes: notes ? notes.trim() : null,
    });

    if (rpcErr) {
      return NextResponse.json(
        { success: false, message: rpcErr.message || "Failed to process review." },
        { status: 400 }
      );
    }

    return NextResponse.json(rpcRes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
