import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/returns/my-returns
 * Fetches all return and replacement requests submitted by the logged-in customer.
 * Optional query param: orderId
 */
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("return_requests")
      .select(`
        *,
        products:products!return_requests_product_id_fkey (id, title, slug, price, product_images(image_url)),
        orders:orders!return_requests_order_id_fkey (id, order_number, created_at, delivered_at),
        replacement_product:products!return_requests_replacement_product_id_fkey (id, title, price, slug, product_images(image_url))
      `)
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (orderId) {
      query = query.eq("order_id", orderId);
    }

    const { data: returns, error: fetchErr } = await query;

    if (fetchErr) {
      // If table does not exist yet
      if (fetchErr.code === "42P01" || fetchErr.message?.includes("does not exist")) {
        return NextResponse.json({ success: true, returns: [] });
      }
      return NextResponse.json({ success: false, message: fetchErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, returns: returns || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
