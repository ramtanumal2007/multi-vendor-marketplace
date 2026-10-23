import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createSupabaseAdminClient } from "@/lib/supabase";
import { confirmProductReceivedBySeller } from "@/lib/return-service";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/seller/returns/[id]/received
 * Seller acknowledges physical arrival of returned product at merchant facility.
 * Transitions status to RETURN_RECEIVED_BY_SELLER or OLD_PRODUCT_RECEIVED.
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

    // Verify approved seller
    const { data: sellerProf } = await supabaseAdmin
      .from("seller_profiles")
      .select("id, verification_status")
      .eq("id", user.id)
      .maybeSingle();

    if (!sellerProf || sellerProf.verification_status !== "approved") {
      return NextResponse.json({ success: false, message: "Seller access denied." }, { status: 403 });
    }

    const result = await confirmProductReceivedBySeller(supabaseAdmin, params.id, user.id);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
