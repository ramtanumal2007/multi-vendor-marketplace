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
 * GET /api/returns/[id]
 * Retrieves details and audit history of a return request with strict privacy boundaries:
 * - Customers view their return request.
 * - Sellers view the product return but NEVER customer financial/bank/UPI data.
 * - Admins view full request; unmasking bank details requires verified admin privilege.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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

    // Check user role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = profile?.role === "admin";

    // Fetch Return Request
    const { data: returnReq, error: fetchErr } = await supabaseAdmin
      .from("return_requests")
      .select(`
        *,
        products:products!return_requests_product_id_fkey (id, title, slug, price, product_images(image_url)),
        orders:orders!return_requests_order_id_fkey (id, order_number, created_at, delivered_at, total),
        order_items (id, title, quantity, unit_price, line_total, sku),
        customer:profiles!return_requests_customer_id_fkey (id, full_name, email, phone),
        seller:seller_profiles!return_requests_seller_id_fkey (id, business_name, business_email),
        replacement_product:products!return_requests_replacement_product_id_fkey (id, title, price, slug, product_images(image_url)),
        replacement_seller:seller_profiles!return_requests_replacement_seller_id_fkey (id, business_name)
      `)
      .eq("id", params.id)
      .single();

    if (fetchErr || !returnReq) {
      if (fetchErr) {
        console.error("Return request lookup error:", fetchErr);
      }
      return NextResponse.json({ success: false, message: "Return request not found." }, { status: 404 });
    }

    const refundDetailsObj = (returnReq.refund_details || {}) as Record<string, unknown>;
    const rawReplItems = Array.isArray(refundDetailsObj.replacementItems)
      ? (refundDetailsObj.replacementItems as Array<Record<string, unknown>>)
      : [];

    const isCustomerOwner = returnReq.customer_id === user.id;
    const isSellerOwner = returnReq.seller_id === user.id;
    const isReplacementSeller = returnReq.replacement_seller_id === user.id;
    const isItemSeller = rawReplItems.some((it) => it.sellerId === user.id);

    if (!isAdmin && !isCustomerOwner && !isSellerOwner && !isReplacementSeller && !isItemSeller) {
      return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
    }

    // Enrich replacementItems with authoritative product SKU, image, seller business name, and store name
    if (returnReq.request_type === "replacement" && rawReplItems.length > 0) {
      const prodIds = Array.from(new Set(rawReplItems.map((i) => i.productId as string).filter(Boolean)));
      const sellerIds = Array.from(new Set(rawReplItems.map((i) => i.sellerId as string).filter(Boolean)));
      const storeIds = Array.from(new Set(rawReplItems.map((i) => i.storeId as string).filter(Boolean)));

      const [prodsRes, sellersRes, storesRes] = await Promise.all([
        prodIds.length > 0
          ? supabaseAdmin
              .from("products")
              .select("id, sku, title, product_images(image_url)")
              .in("id", prodIds)
          : { data: [] },
        sellerIds.length > 0
          ? supabaseAdmin
              .from("seller_profiles")
              .select("id, business_name")
              .in("id", sellerIds)
          : { data: [] },
        storeIds.length > 0
          ? supabaseAdmin
              .from("stores")
              .select("id, name")
              .in("id", storeIds)
          : { data: [] },
      ]);

      const prodMap = new Map((prodsRes.data || []).map((p) => [p.id, p]));
      const sellerMap = new Map((sellersRes.data || []).map((s) => [s.id, s]));
      const storeMap = new Map((storesRes.data || []).map((st) => [st.id, st]));

      const enrichedReplItems = rawReplItems.map((it) => {
        const p = prodMap.get(it.productId as string);
        const s = sellerMap.get(it.sellerId as string);
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
          sellerName: s?.business_name || (it.sellerName as string) || "Merchant",
          storeName: st?.name || s?.business_name || (it.storeName as string) || "Store",
        };
      });

      refundDetailsObj.replacementItems = enrichedReplItems;
      returnReq.refund_details = refundDetailsObj;
    }

    // Fetch Timeline / Audit logs
    const { data: auditLogs } = await supabaseAdmin
      .from("return_audit_logs")
      .select("*")
      .eq("return_request_id", params.id)
      .order("created_at", { ascending: true });

    // PRIVACY ENFORCEMENT
    const sanitizedReturn: Record<string, unknown> = { ...returnReq };

    if (!isAdmin && (isSellerOwner || isReplacementSeller || isItemSeller)) {
      // SELLER PRIVACY RULE: Seller NEVER sees customer UPI / Bank Account details or refund references!
      delete sanitizedReturn.refund_payment_reference;
      delete sanitizedReturn.customer;

      if (sanitizedReturn.refund_details) {
        const sellerRefDetails = { ...(sanitizedReturn.refund_details as Record<string, unknown>) };
        delete sellerRefDetails.upiId;
        delete sellerRefDetails.accountHolder;
        delete sellerRefDetails.accountNumber;
        delete sellerRefDetails.ifscCode;
        delete sellerRefDetails.bankName;
        delete sellerRefDetails.branch;

        if (Array.isArray(sellerRefDetails.replacementItems)) {
          // Each seller sees ONLY their own assigned replacement products
          sellerRefDetails.replacementItems = (sellerRefDetails.replacementItems as Array<Record<string, unknown>>).filter(
            (it) => it.sellerId === user.id
          );
        }

        sanitizedReturn.refund_details = sellerRefDetails;
      }

      // In cross-seller replacement: original seller must NOT see new seller's identity unless same seller
      if (returnReq.seller_id !== returnReq.replacement_seller_id && isSellerOwner && !isReplacementSeller && !isItemSeller) {
        delete sanitizedReturn.replacement_seller;
        delete sanitizedReturn.replacement_seller_id;
      }
    } else if (isCustomerOwner && !isAdmin) {
      // Customer sees masked refund details for privacy safety
      sanitizedReturn.refund_details = maskRefundDetails(
        returnReq.refund_details as Record<string, unknown>
      );
    } else if (isAdmin) {
      const url = new URL(req.url);
      const shouldReveal = url.searchParams.get("reveal") === "true";
      if (!shouldReveal) {
        sanitizedReturn.refund_details = maskRefundDetails(
          returnReq.refund_details as Record<string, unknown>
        );
      }
    }

    // Sanitize audit logs for privacy boundaries
    const sanitizedLogs = (auditLogs || []).map((log) => {
      if (isAdmin) return log;

      const safeLog: Record<string, unknown> = {
        id: log.id,
        return_request_id: log.return_request_id,
        actor_type: log.actor_type,
        action: log.action,
        previous_status: log.previous_status,
        new_status: log.new_status,
        notes: log.notes,
        created_at: log.created_at,
      };

      const meta =
        typeof log.metadata === "object" && log.metadata !== null
          ? { ...(log.metadata as Record<string, unknown>) }
          : {};

      safeLog.metadata = {
        pickupScheduledDate: meta.pickupScheduledDate || undefined,
        pickupStatus: meta.pickupStatus || undefined,
      };

      return safeLog;
    });

    return NextResponse.json({
      success: true,
      returnRequest: sanitizedReturn,
      auditLogs: sanitizedLogs,
      userRole: isAdmin ? "admin" : isSellerOwner || isReplacementSeller || isItemSeller ? "seller" : "customer",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
