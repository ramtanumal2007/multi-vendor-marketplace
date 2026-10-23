import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/seller/custom-cakes/[id]/action
 * Seller actions: accept_request, decline_request, send_quote, request_clarification, get_details.
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
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify user is the assigned approved seller
    const { data: request, error: reqErr } = await supabaseAdmin
      .from("custom_cake_requests")
      .select("*, stores(id, name), seller_profiles(id, business_name)")
      .eq("id", id)
      .eq("assigned_seller_id", user.id)
      .single();

    if (reqErr || !request) {
      return NextResponse.json(
        { success: false, message: "Custom cake request not found or not assigned to your store." },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { action, cake_price, customization_charge, delivery_charge, discount, seller_note, notes } = body;

    // 0. GET DETAILS (with signed URLs)
    if (action === "get_details") {
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

      const { data: activityLogs } = await supabaseAdmin
        .from("custom_cake_activity_logs")
        .select("*")
        .eq("request_id", id)
        .order("created_at", { ascending: true });

      return NextResponse.json({
        success: true,
        request: {
          ...request,
          signed_reference_images: signedImages,
        },
        activity_logs: activityLogs || [],
      });
    }

    // 1. ACCEPT REQUEST
    if (action === "accept_request") {
      await supabaseAdmin
        .from("custom_cake_requests")
        .update({
          status: "SELLER_REVIEW",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: id,
        action: "SELLER_ACCEPTED",
        actor_id: user.id,
        actor_role: "seller",
        actor_name: request.seller_profiles?.business_name || "Bakery Partner",
        notes: "Seller accepted request and is calculating quotation.",
      });

      return NextResponse.json({
        success: true,
        message: "Request accepted. You can now submit your quote.",
      });
    }

    // 2. DECLINE REQUEST
    if (action === "decline_request") {
      await supabaseAdmin
        .from("custom_cake_requests")
        .update({
          status: "DECLINED",
          clarification_notes: notes || "Seller is unable to fulfill this cake request.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: id,
        action: "SELLER_DECLINED",
        actor_id: user.id,
        actor_role: "seller",
        actor_name: request.seller_profiles?.business_name || "Bakery Partner",
        notes: notes || "Seller declined custom cake request.",
      });

      // Alert Admin so they can reassign
      try {
        await supabaseAdmin.from("admin_notifications_log").insert({
          title: "Custom Cake Request Declined by Seller",
          message: `Seller ${request.seller_profiles?.business_name || user.id} declined Request #${request.request_number || request.id.slice(0, 8)}. Please reassign to another bakery.`,
          type: "custom_cake_declined",
          link_url: `/admin/custom-cakes`,
          metadata: { request_id: id },
        });
      } catch {
        // Non-blocking
      }

      return NextResponse.json({
        success: true,
        message: "Request marked as declined. Admin will be notified to reassign.",
      });
    }

    // 3. SEND QUOTE
    if (action === "send_quote") {
      const numCakePrice = Number(cake_price || 0);
      const numCustomization = Number(customization_charge || 0);
      const numDelivery = Number(delivery_charge || 0);
      const numDiscount = Number(discount || 0);

      if (numCakePrice <= 0 && numCustomization <= 0) {
        return NextResponse.json(
          { success: false, message: "Please provide a valid cake price greater than ₹0." },
          { status: 400 }
        );
      }

      // Server-authoritative calculation
      const finalPayable = Math.max(0, Math.round((numCakePrice + numCustomization + numDelivery - numDiscount) * 100) / 100);

      const quoteObject = {
        cake_price: numCakePrice,
        customization_charge: numCustomization,
        delivery_charge: numDelivery,
        discount: numDiscount,
        final_amount: finalPayable,
        seller_note: seller_note ? String(seller_note).trim() : "",
        quoted_at: new Date().toISOString(),
        store_name: request.stores?.name || request.seller_profiles?.business_name || "Bakery Partner",
      };

      await supabaseAdmin
        .from("custom_cake_requests")
        .update({
          seller_quote: quoteObject,
          status: "QUOTED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      // Audit Log
      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: id,
        action: "SELLER_QUOTED",
        actor_id: user.id,
        actor_role: "seller",
        actor_name: request.seller_profiles?.business_name || "Bakery Partner",
        notes: `Seller submitted quote of ₹${finalPayable} (Base: ₹${numCakePrice}, Custom: ₹${numCustomization}, Delivery: ₹${numDelivery}, Discount: ₹${numDiscount}).`,
        metadata: quoteObject,
      });

      // Notify Customer
      try {
        await supabaseAdmin.from("customer_notifications").insert({
          user_id: request.user_id,
          title: "Your Custom Cake Quote is Ready! 🎂",
          message: `The bakery has quoted ₹${finalPayable} for your request #${request.request_number || request.id.slice(0, 8)}. Review details and confirm your order.`,
          type: "system",
          priority: "high",
          link_url: `/account/custom-cakes/${id}`,
        });
      } catch {
        // Non-blocking
      }

      return NextResponse.json({
        success: true,
        message: "Quote sent successfully to customer!",
        quote: quoteObject,
      });
    }

    // 4. REQUEST CLARIFICATION
    if (action === "request_clarification") {
      await supabaseAdmin
        .from("custom_cake_requests")
        .update({
          status: "CLARIFICATION_REQUESTED",
          clarification_notes: notes || "Seller requested additional design details.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: id,
        action: "CLARIFICATION_REQUESTED",
        actor_id: user.id,
        actor_role: "seller",
        actor_name: request.seller_profiles?.business_name || "Bakery Partner",
        notes: notes || "Seller asked for clarification from customer.",
      });

      try {
        await supabaseAdmin.from("customer_notifications").insert({
          user_id: request.user_id,
          title: "Bakery Partner Has a Question",
          message: `Regarding Request #${request.request_number || request.id.slice(0, 8)}: "${notes || 'Please provide additional clarification on your cake specifications'}".`,
          type: "system",
          priority: "high",
          link_url: `/account/custom-cakes/${id}`,
        });
      } catch {
        // Non-blocking
      }

      return NextResponse.json({
        success: true,
        message: "Clarification sent to customer.",
      });
    }

    return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Seller custom cake action error:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
