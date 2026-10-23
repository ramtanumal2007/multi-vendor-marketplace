import { NextResponse } from "next/server";
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
 * GET /api/seller/returns
 * Fetches all return and replacement requests for the authenticated seller.
 * STRICT PRIVACY: Omits customer UPI ID, bank account number, IFSC, and customer credentials.
 */
export async function GET() {
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

    // Query returns with complete refund_details
    const { data: returnRequests, error: fetchErr } = await supabaseAdmin
      .from("return_requests")
      .select(`
        id,
        return_number,
        request_type,
        order_id,
        order_item_id,
        seller_id,
        replacement_seller_id,
        quantity,
        reason_code,
        reason_text,
        status,
        seller_received_at,
        pickup_status,
        pickup_scheduled_date,
        created_at,
        updated_at,
        refund_details,
        products:products!return_requests_product_id_fkey (id, title, sku, slug, price, product_images(image_url)),
        orders:orders!return_requests_order_id_fkey (id, order_number, created_at, delivered_at),
        replacement_product:products!return_requests_replacement_product_id_fkey (id, title, sku, slug, price, product_images(image_url))
      `)
      .order("created_at", { ascending: false });

    if (fetchErr) {
      if (fetchErr.code === "42P01" || fetchErr.message?.includes("does not exist")) {
        return NextResponse.json({ success: true, returns: [] });
      }
      return NextResponse.json({ success: false, message: fetchErr.message }, { status: 500 });
    }

    // Filter to requests relevant to this seller:
    // - Seller is original returned item merchant (seller_id === user.id)
    // - Seller is primary replacement merchant (replacement_seller_id === user.id)
    // - Seller has assigned replacement product lines (item.sellerId === user.id)
    const relevantRequests = (returnRequests || []).filter((r) => {
      if (r.seller_id === user.id || r.replacement_seller_id === user.id) return true;
      const refDetails = r.refund_details as Record<string, unknown> | null;
      if (Array.isArray(refDetails?.replacementItems)) {
        return refDetails.replacementItems.some((it: Record<string, unknown>) => it.sellerId === user.id);
      }
      return false;
    });

    // Collect all candidate replacement product IDs and store IDs across relevant requests for enrichment
    const allReplProdIds = new Set<string>();
    const allStoreIds = new Set<string>();

    relevantRequests.forEach((r) => {
      const refDetails = r.refund_details as Record<string, unknown> | null;
      if (Array.isArray(refDetails?.replacementItems)) {
        refDetails.replacementItems.forEach((it: Record<string, unknown>) => {
          if (it.productId && typeof it.productId === "string") allReplProdIds.add(it.productId);
          if (it.storeId && typeof it.storeId === "string") allStoreIds.add(it.storeId);
        });
      }
    });

    const [prodsRes, storesRes] = await Promise.all([
      allReplProdIds.size > 0
        ? supabaseAdmin
            .from("products")
            .select("id, sku, title, product_images(image_url)")
            .in("id", Array.from(allReplProdIds))
        : { data: [] },
      allStoreIds.size > 0
        ? supabaseAdmin
            .from("stores")
            .select("id, name")
            .in("id", Array.from(allStoreIds))
        : { data: [] },
    ]);

    const prodMap = new Map((prodsRes.data || []).map((p) => [p.id, p]));
    const storeMap = new Map((storesRes.data || []).map((s) => [s.id, s]));

    // STRICT SELLER PRIVACY:
    // 1. Never expose customer financial information (UPI ID, bank account, IFSC).
    // 2. Each seller sees ONLY their own assigned replacement product lines.
    // 3. Redact cross-seller replacement merchant identity from original seller.
    const sanitizedRequests = relevantRequests.map((r) => {
      const sanitized = { ...r } as Record<string, unknown>;

      if (
        sanitized.seller_id === user.id &&
        sanitized.replacement_seller_id &&
        sanitized.replacement_seller_id !== user.id
      ) {
        delete sanitized.replacement_seller_id;
      }

      if (sanitized.refund_details) {
        const refObj = { ...(sanitized.refund_details as Record<string, unknown>) };
        delete refObj.upiId;
        delete refObj.accountHolder;
        delete refObj.accountNumber;
        delete refObj.ifscCode;
        delete refObj.bankName;
        delete refObj.branch;

        if (Array.isArray(refObj.replacementItems)) {
          // Filter to ONLY items assigned to this seller
          const sellerItems = (refObj.replacementItems as Array<Record<string, unknown>>)
            .filter((it) => it.sellerId === user.id)
            .map((it) => {
              const p = prodMap.get(it.productId as string);
              const st = storeMap.get(it.storeId as string);
              return {
                ...it,
                sku: it.sku || p?.sku || "N/A",
                title: it.productTitle || it.title || p?.title || "Replacement Item",
                imageUrl:
                  it.imageUrl ||
                  it.image ||
                  (Array.isArray(p?.product_images) && p.product_images[0]?.image_url) ||
                  null,
                storeName: st?.name || (it.storeName as string) || "Store",
              };
            });
          refObj.replacementItems = sellerItems;
        }

        sanitized.refund_details = refObj;
      }

      return sanitized;
    });

    return NextResponse.json({ success: true, returns: sanitizedRequests });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
