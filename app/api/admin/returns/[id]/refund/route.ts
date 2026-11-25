import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createSupabaseAdminClient } from "@/lib/supabase";
import { processAdminReturnRefund } from "@/lib/return-service";
import { notifyRefundProcessed } from "@/lib/email";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/admin/returns/[id]/refund
 * Authoritative admin refund completion endpoint.
 * Requires genuine payment reference ID (UPI / UTR / IMPS / NEFT / WALLET).
 * Transitions status to REFUND_COMPLETED and records audit log.
 * Synchronizes seller settlement, seller ledger, and wallet credit if applicable.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const cookieStore = cookies();
    const supabaseUser = createServerClient(
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
            } catch {}
          },
        },
      }
    );

    const {
      data: { user },
      error: authErr,
    } = await supabaseUser.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify admin role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { paymentReference, refundAmount, processedAt, notes } = body;

    const result = await processAdminReturnRefund(supabaseAdmin, {
      returnRequestId: params.id,
      adminUserId: user.id,
      paymentReference,
      refundAmount,
      processedAt,
      notes,
    });

    if (result.success) {
      // Non-fatal transactional email dispatch
      (async () => {
        try {
          const { data: retReq } = await supabaseAdmin
            .from("return_requests")
            .select("id, return_number, customer_id, order_id, orders(order_number, email), profiles(email, full_name)")
            .eq("id", params.id)
            .single();

          const targetEmail = (retReq?.orders as unknown as { email?: string })?.email || 
                              (retReq?.profiles as unknown as { email?: string })?.email;
          const customerName = (retReq?.profiles as unknown as { full_name?: string })?.full_name || "Valued Customer";
          const orderNum = (retReq?.orders as unknown as { order_number?: string })?.order_number || 
                           retReq?.return_number || params.id.slice(0, 8);

          if (targetEmail) {
            await notifyRefundProcessed({
              orderNumber: orderNum,
              customerEmail: targetEmail,
              customerName,
              refundAmount: result.refundAmount || Number(refundAmount || 0),
              refundId: retReq?.return_number || params.id,
              bankReference: paymentReference?.trim(),
              processedAt,
            });
          }
        } catch (emailErr) {
          console.warn("[AdminRefund] Non-fatal notification notice:", emailErr);
        }
      })();
    }

    return NextResponse.json(result, { status: result.status || (result.success ? 200 : 400) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
