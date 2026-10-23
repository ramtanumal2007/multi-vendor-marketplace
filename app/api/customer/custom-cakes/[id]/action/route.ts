import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/customer/custom-cakes/[id]/action
 * Customer actions on quote: accept_quote, decline_quote, request_changes, cancel_request.
 */
export async function POST(
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

    const body = await req.json();
    const { action, notes } = body;

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch existing request
    const { data: request, error: reqErr } = await supabaseAdmin
      .from("custom_cake_requests")
      .select("*, stores(id, name)")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (reqErr || !request) {
      return NextResponse.json(
        { success: false, message: "Custom cake request not found or unauthorized." },
        { status: 404 }
      );
    }

    // 1. ACCEPT QUOTE -> CONVERT TO REAL MARKETPLACE ORDER (COD DEFAULT)
    if (action === "accept_quote") {
      // Idempotency: If already converted, return existing order to prevent duplicates
      if (request.converted_order_id || request.status === "CONVERTED_TO_ORDER") {
        return NextResponse.json({
          success: true,
          message: "Custom cake request is already converted to an order.",
          order_id: request.converted_order_id,
        });
      }

      if (request.status !== "QUOTED" && request.status !== "CUSTOMER_ACCEPTED") {
        return NextResponse.json(
          { success: false, message: `Cannot accept quote in '${request.status}' status.` },
          { status: 400 }
        );
      }

      const quote = request.seller_quote;
      if (!quote || quote.final_amount === undefined || quote.final_amount === null) {
        return NextResponse.json(
          { success: false, message: "No valid quote found on this request to accept." },
          { status: 400 }
        );
      }

      // Strict email resolution check
      const { data: prof } = await supabaseAdmin.from("profiles").select("email").eq("id", user.id).maybeSingle();
      const validEmail = user.email || prof?.email;
      if (!validEmail || !validEmail.includes("@")) {
        return NextResponse.json(
          { success: false, message: "A verified email address is missing from your account. Please update your profile before checking out." },
          { status: 400 }
        );
      }

      const { data: rpcRes, error: rpcErr } = await supabaseAdmin.rpc("convert_custom_cake_to_order_server", {
        p_request_id: request.id,
        p_payment_method: "COD",
        p_payment_status: "pending",
        p_internal_status: "ORDERED",
        p_fulfillment_status: "pending",
        p_payment_reference: null,
        p_cashfree_order_id: null,
      });

      if (rpcErr || !rpcRes || !rpcRes.success) {
        console.error("Order conversion failed:", rpcErr);
        return NextResponse.json(
          { success: false, message: rpcErr?.message || "Failed to convert custom cake to order." },
          { status: 500 }
        );
      }

      // Insert Activity Log
      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: id,
        action: "CUSTOMER_ACCEPTED_COD",
        actor_id: user.id,
        actor_role: "customer",
        actor_name: request.contact_name || "Customer",
        notes: `Customer accepted quote of ₹${quote.final_amount} with Cash on Delivery. Order #${rpcRes.order_number} generated.`,
      });

      // Notifications
      try {
        await supabaseAdmin.from("customer_notifications").insert({
          user_id: user.id,
          title: "Custom Cake Order Created! 🎉",
          message: `Your custom cake order #${rpcRes.order_number} is placed with COD. Track live preparation and delivery status in your orders.`,
          type: "order_confirmation",
          priority: "high",
          link_url: `/account/orders/${rpcRes.order_id}`,
        });

        if (request.assigned_seller_id) {
          await supabaseAdmin.from("seller_notifications").insert({
            seller_id: request.assigned_seller_id,
            title: "Custom Cake Quote Accepted! 🎂",
            message: `Customer accepted your quote for Request #${request.request_number || request.id.slice(0, 8)}. Order #${rpcRes.order_number} is ready for processing in your Seller Orders.`,
            type: "order",
            priority: "high",
            link_url: `/seller/orders`,
          });
        }
      } catch {
        // Non-blocking
      }

      return NextResponse.json({
        success: true,
        message: "Quote accepted! Your order has been placed successfully.",
        order_id: rpcRes.order_id,
        order_number: rpcRes.order_number,
        invoice_number: rpcRes.invoice_number,
      });
    }

    // 2. DECLINE QUOTE
    if (action === "decline_quote") {
      await supabaseAdmin
        .from("custom_cake_requests")
        .update({
          status: "DECLINED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: id,
        action: "DECLINED",
        actor_id: user.id,
        actor_role: "customer",
        actor_name: request.contact_name,
        notes: notes || "Customer declined the quote.",
      });

      return NextResponse.json({
        success: true,
        message: "Quote declined.",
      });
    }

    // 3. REQUEST CHANGES
    if (action === "request_changes") {
      await supabaseAdmin
        .from("custom_cake_requests")
        .update({
          status: "CLARIFICATION_REQUESTED",
          clarification_notes: notes || "Customer requested revisions to quote.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: id,
        action: "CLARIFICATION_REQUESTED",
        actor_id: user.id,
        actor_role: "customer",
        actor_name: request.contact_name,
        notes: notes || "Customer requested revisions to quote.",
      });

      if (request.assigned_seller_id) {
        try {
          await supabaseAdmin.from("seller_notifications").insert({
            seller_id: request.assigned_seller_id,
            title: "Custom Cake Revisions Requested 📝",
            message: `Customer asked for quote adjustments on Request #${request.request_number || request.id.slice(0, 8)}: "${notes || 'Requested changes'}".`,
            type: "system",
            priority: "medium",
            link_url: `/seller/custom-cakes`,
          });
        } catch {
          // Non-blocking
        }
      }

      return NextResponse.json({
        success: true,
        message: "Revision request submitted to seller.",
      });
    }

    // 4. CANCEL REQUEST
    if (action === "cancel_request") {
      if (request.status === "CONVERTED_TO_ORDER") {
        return NextResponse.json(
          { success: false, message: "Order is already confirmed. Please manage cancellation from your Orders page." },
          { status: 400 }
        );
      }

      await supabaseAdmin
        .from("custom_cake_requests")
        .update({
          status: "CANCELLED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: id,
        action: "CANCELLED",
        actor_id: user.id,
        actor_role: "customer",
        actor_name: request.contact_name,
        notes: notes || "Customer cancelled custom cake request.",
      });

      return NextResponse.json({
        success: true,
        message: "Request cancelled.",
      });
    }

    return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Custom cake customer action error:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
