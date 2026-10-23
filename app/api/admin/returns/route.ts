import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createSupabaseAdminClient } from "@/lib/supabase";
import { maskRefundDetails } from "@/lib/return-service";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/admin/returns
 * Admin listing of all return and replacement requests across the platform with
 * status filtering, text search, statistics counters, and pagination.
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

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");
    const typeFilter = searchParams.get("type");
    const searchQuery = searchParams.get("q")?.trim().toLowerCase();

    let query = supabaseAdmin
      .from("return_requests")
      .select(`
        *,
        products:products!return_requests_product_id_fkey (id, title, sku, slug, price, product_images(image_url)),
        orders:orders!return_requests_order_id_fkey (id, order_number, created_at, delivered_at, total),
        customer:profiles!return_requests_customer_id_fkey (id, full_name, email, phone),
        seller:seller_profiles!return_requests_seller_id_fkey (id, business_name, business_email),
        replacement_product:products!return_requests_replacement_product_id_fkey (id, title, sku, slug, price),
        replacement_seller:seller_profiles!return_requests_replacement_seller_id_fkey (id, business_name)
      `)
      .order("created_at", { ascending: false });

    if (statusFilter && statusFilter !== "ALL") {
      query = query.eq("status", statusFilter);
    }

    if (typeFilter && typeFilter !== "ALL") {
      query = query.eq("request_type", typeFilter);
    }

    const { data: returns, error: fetchErr } = await query;

    if (fetchErr) {
      if (fetchErr.code === "42P01" || fetchErr.message?.includes("does not exist")) {
        return NextResponse.json({
          success: true,
          returns: [],
          stats: { total: 0, requested: 0, pickupPending: 0, sellerReceived: 0, refundPending: 0, completed: 0 },
        });
      }
      return NextResponse.json({ success: false, message: fetchErr.message }, { status: 500 });
    }

    let filtered = returns || [];

    if (searchQuery) {
      filtered = filtered.filter((r) => {
        const retNum = (r.return_number || "").toLowerCase();
        const ordNum = (r.orders?.order_number || "").toLowerCase();
        const custName = (r.customer?.full_name || r.customer?.email || "").toLowerCase();
        const prodTitle = (r.products?.title || "").toLowerCase();
        const sellerName = (r.seller?.business_name || "").toLowerCase();
        return (
          retNum.includes(searchQuery) ||
          ordNum.includes(searchQuery) ||
          custName.includes(searchQuery) ||
          prodTitle.includes(searchQuery) ||
          sellerName.includes(searchQuery)
        );
      });
    }

    // Mask refund details by default unless explicit unmasking is performed per item
    const sanitizedReturns = filtered.map((r) => ({
      ...r,
      refund_details: maskRefundDetails(r.refund_details as Record<string, unknown>),
    }));

    // Calculate quick statistics counters
    const all = returns || [];
    const stats = {
      total: all.length,
      requested: all.filter((r) => r.status === "RETURN_REQUESTED" || r.status === "REPLACEMENT_REQUESTED").length,
      pickupPending: all.filter((r) => r.status.includes("PICKUP")).length,
      sellerReceived: all.filter((r) => r.status === "RETURN_RECEIVED_BY_SELLER" || r.status === "OLD_PRODUCT_RECEIVED").length,
      refundPending: all.filter((r) => r.status === "REFUND_APPROVED" || r.status === "REFUND_PROCESSING").length,
      completed: all.filter((r) => r.status === "REFUND_COMPLETED" || r.status === "RETURN_CLOSED" || r.status === "REPLACEMENT_CLOSED").length,
    };

    return NextResponse.json({
      success: true,
      returns: sanitizedReturns,
      stats,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
