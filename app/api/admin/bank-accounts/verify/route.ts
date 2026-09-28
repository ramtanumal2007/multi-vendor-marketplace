import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    // Verify admin role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Forbidden: Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { accountId, action, reason, adminNote } = body;

    const normalizedAction = String(action || "").toUpperCase().trim();
    const validActions = ["VERIFY", "APPROVE", "RETURN_FOR_CORRECTION", "CORRECTION", "REJECT"];

    if (!accountId || !validActions.includes(normalizedAction)) {
      return NextResponse.json(
        { success: false, message: "Invalid parameters. action must be APPROVE, RETURN_FOR_CORRECTION, or REJECT." },
        { status: 400 }
      );
    }

    if (
      (normalizedAction === "RETURN_FOR_CORRECTION" || normalizedAction === "CORRECTION" || normalizedAction === "REJECT") &&
      (!reason || !reason.trim())
    ) {
      return NextResponse.json(
        { success: false, message: "A reason is mandatory for correction requests or rejections." },
        { status: 400 }
      );
    }

    const { data: result, error: rpcErr } = await supabase.rpc("verify_seller_bank_account", {
      p_account_id: accountId,
      p_action: normalizedAction,
      p_reason: reason?.trim() || null,
      p_admin_note: adminNote?.trim() || null,
    });

    if (rpcErr) {
      return NextResponse.json({ success: false, message: rpcErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
