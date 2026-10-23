import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient as createSupabaseAdminClient, validateSupabaseConfig } from "@/lib/supabase";
import { cancelCustomerOrderServer } from "@/lib/return-service";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/orders/[id]/cancel
 * Customer cancels an order before it enters transit / shipped status.
 * Server strictly verifies ownership, status eligibility, and restores product inventory atomically.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const cookieStore = cookies();
    validateSupabaseConfig();
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
        { success: false, message: "Authentication required to cancel order." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { reasonCode, reasonText } = body;

    if (!reasonCode) {
      return NextResponse.json(
        { success: false, message: "Cancellation reason is required." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const result = await cancelCustomerOrderServer(supabaseAdmin, {
      orderId: params.id,
      customerId: user.id,
      reasonCode,
      reasonText,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    console.error("Order cancel exception:", err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
