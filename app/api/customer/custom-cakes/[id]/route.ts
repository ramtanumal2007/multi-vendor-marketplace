import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/customer/custom-cakes/[id]
 * Retrieves full details of a specific custom cake request for the customer,
 * including signed URLs for reference images and activity logs.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ success: false, message: "Request ID is required." }, { status: 400 });
    }

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
            } catch {
              // Ignore in route handlers
            }
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch request (without joining internal store information)
    const { data: request, error: reqErr } = await supabaseAdmin
      .from("custom_cake_requests")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (reqErr || !request) {
      return NextResponse.json(
        { success: false, message: "Custom cake request not found or access denied." },
        { status: 404 }
      );
    }

    // Generate signed URLs for private reference images
    const rawImages = Array.isArray(request.reference_images) ? request.reference_images : [];
    const signedImages: { path: string; signedUrl: string }[] = [];

    for (const imgPath of rawImages) {
      if (typeof imgPath === "string" && imgPath.trim()) {
        const { data: sData } = await supabaseAdmin.storage
          .from("custom-cake-references")
          .createSignedUrl(imgPath, 300);

        signedImages.push({
          path: imgPath,
          signedUrl: sData?.signedUrl || "",
        });
      }
    }

    // Fetch activity logs and sanitize seller actor identities
    const { data: rawLogs } = await supabaseAdmin
      .from("custom_cake_activity_logs")
      .select("id, request_id, action, actor_role, notes, created_at")
      .eq("request_id", id)
      .order("created_at", { ascending: true });

    const activityLogs = (rawLogs || []).map((log) => ({
      ...log,
      actor_name: log.actor_role === "seller" ? "Bakery Partner" : log.actor_role === "admin" ? "VENDOSMITH Support" : "You",
    }));

    // If order was converted, fetch order summary
    let convertedOrder = null;
    if (request.converted_order_id) {
      const { data: ord } = await supabaseAdmin
        .from("orders")
        .select("id, order_number, invoice_number, total, payment_status, internal_status, created_at")
        .eq("id", request.converted_order_id)
        .maybeSingle();

      convertedOrder = ord;
    }

    // Strict Customer Privacy: Strip bakery identity, seller IDs, store details
    const sanitizedQuote = request.seller_quote ? {
      cake_price: request.seller_quote.cake_price,
      customization_charge: request.seller_quote.customization_charge,
      delivery_charge: request.seller_quote.delivery_charge,
      discount: request.seller_quote.discount,
      final_amount: request.seller_quote.final_amount,
      seller_note: request.seller_quote.seller_note,
      quoted_at: request.seller_quote.quoted_at,
      store_name: "Verified Bakery Partner",
    } : null;

    const sanitizedRequest = {
      ...request,
      assigned_seller_id: undefined,
      assigned_store_id: undefined,
      seller_quote: sanitizedQuote,
      signed_reference_images: signedImages,
    };

    return NextResponse.json({
      success: true,
      request: sanitizedRequest,
      activity_logs: activityLogs,
      converted_order: convertedOrder,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
