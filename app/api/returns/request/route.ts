import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createSupabaseAdminClient } from "@/lib/supabase";
import { createReturnRequestServer } from "@/lib/return-service";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/returns/request
 * Customer initiates a Return & Refund or Replacement request for an order item.
 * Supports both single-item and multi-product replacements.
 */
export async function POST(req: NextRequest) {
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
      return NextResponse.json(
        { success: false, message: "Authentication required to submit a return request." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      orderId,
      orderItemId,
      requestType,
      quantity,
      reasonCode,
      reasonText,
      refundMethod,
      refundDetails,
      replacementProductId,
      replacementQuantity,
      replacementItems,
      replacementPaymentMethod,
    } = body;

    if (!orderId || !orderItemId || !requestType || !reasonCode) {
      return NextResponse.json(
        { success: false, message: "Missing required return parameters." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const result = await createReturnRequestServer(supabaseAdmin, {
      customerId: user.id,
      orderId,
      orderItemId,
      requestType,
      quantity: Number(quantity) || 1,
      reasonCode,
      reasonText,
      refundMethod,
      refundDetails,
      replacementProductId,
      replacementQuantity: Number(replacementQuantity) || Number(quantity) || 1,
      replacementItems: Array.isArray(replacementItems) ? replacementItems : undefined,
      replacementPaymentMethod,
    });

    return NextResponse.json(result, { status: result.status || 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    console.error("Return request exception:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
