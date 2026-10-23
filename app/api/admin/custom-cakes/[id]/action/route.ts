import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient, createAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/custom-cakes/[id]/action
 * Admin actions: forward_to_seller, change_seller, request_clarification, reject_request, get_details.
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

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") {
      return NextResponse.json({ success: false, message: "Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { action, seller_id, store_id, notes } = body;

    // Fetch existing request
    const { data: request, error: reqErr } = await supabaseAdmin
      .from("custom_cake_requests")
      .select("*, stores(id, name), seller_profiles(id, business_name)")
      .eq("id", id)
      .single();

    if (reqErr || !request) {
      return NextResponse.json({ success: false, message: "Custom cake request not found." }, { status: 404 });
    }

    // 0. GET DETAILS (with signed URLs & activity logs)
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

    // 1. FORWARD TO SELLER / CHANGE SELLER
    if (action === "forward_to_seller" || action === "change_seller") {
      if (!seller_id) {
        return NextResponse.json({ success: false, message: "Please select an approved seller." }, { status: 400 });
      }

      // Verify seller is APPROVED (Rule P)
      const { data: sellerProf } = await supabaseAdmin
        .from("seller_profiles")
        .select("id, business_name, verification_status")
        .eq("id", seller_id)
        .single();

      if (!sellerProf || sellerProf.verification_status !== "approved") {
        return NextResponse.json(
          { success: false, message: "Cannot assign to unapproved or suspended sellers." },
          { status: 400 }
        );
      }

      // Fetch store
      let finalStoreId = store_id;
      if (!finalStoreId) {
        const { data: st } = await supabaseAdmin
          .from("stores")
          .select("id")
          .eq("seller_id", seller_id)
          .maybeSingle();
        finalStoreId = st?.id || null;
      }

      const newStatus = "FORWARDED_TO_SELLER";

      await supabaseAdmin
        .from("custom_cake_requests")
        .update({
          assigned_seller_id: seller_id,
          assigned_store_id: finalStoreId,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      // Audit Log
      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: id,
        action: action === "change_seller" ? "SELLER_REASSIGNED" : "FORWARDED_TO_SELLER",
        actor_id: user.id,
        actor_role: "admin",
        actor_name: profile?.full_name || "Admin",
        notes: `Admin assigned request to seller "${sellerProf.business_name}".`,
        metadata: { seller_id, store_id: finalStoreId },
      });

      // Notify Seller
      try {
        await supabaseAdmin.from("seller_notifications").insert({
          seller_id: seller_id,
          title: "New Custom Cake Request Assigned 🎂",
          message: `Admin forwarded Request #${request.request_number || request.id.slice(0, 8)} (${request.cake_type}, ${request.flavor}, ${request.weight}) to your store. Review requirements and submit a quote.`,
          type: "system",
          priority: "high",
          link_url: `/seller/custom-cakes`,
        });
      } catch {
        // Non-blocking
      }

      // Notify Customer
      try {
        await supabaseAdmin.from("customer_notifications").insert({
          user_id: request.user_id,
          title: "Cake Request Forwarded to Bakery",
          message: `Your custom cake request #${request.request_number || request.id.slice(0, 8)} has been assigned to verified bakery partner "${sellerProf.business_name}". A quote will be prepared shortly.`,
          type: "system",
          priority: "medium",
          link_url: `/account/custom-cakes/${id}`,
        });
      } catch {
        // Non-blocking
      }

      return NextResponse.json({
        success: true,
        message: `Request successfully forwarded to ${sellerProf.business_name}.`,
      });
    }

    // 2. REQUEST CLARIFICATION
    if (action === "request_clarification") {
      await supabaseAdmin
        .from("custom_cake_requests")
        .update({
          status: "CLARIFICATION_REQUESTED",
          clarification_notes: notes || "Admin requested clarification.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: id,
        action: "CLARIFICATION_REQUESTED",
        actor_id: user.id,
        actor_role: "admin",
        actor_name: profile?.full_name || "Admin",
        notes: notes || "Clarification requested from customer.",
      });

      try {
        await supabaseAdmin.from("customer_notifications").insert({
          user_id: request.user_id,
          title: "Clarification Needed for Your Cake Request",
          message: notes || "Please check your custom cake request details for further instructions.",
          type: "system",
          priority: "high",
          link_url: `/account/custom-cakes/${id}`,
        });
      } catch {
        // Non-blocking
      }

      return NextResponse.json({
        success: true,
        message: "Clarification request sent to customer.",
      });
    }

    // 3. REJECT REQUEST
    if (action === "reject_request") {
      await supabaseAdmin
        .from("custom_cake_requests")
        .update({
          status: "REJECTED",
          clarification_notes: notes || "Request could not be accommodated.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      await supabaseAdmin.from("custom_cake_activity_logs").insert({
        request_id: id,
        action: "REJECTED",
        actor_id: user.id,
        actor_role: "admin",
        actor_name: profile?.full_name || "Admin",
        notes: notes || "Admin rejected the request.",
      });

      try {
        await supabaseAdmin.from("customer_notifications").insert({
          user_id: request.user_id,
          title: "Custom Cake Request Update",
          message: `Your request #${request.request_number || request.id.slice(0, 8)} could not be processed at this time. Reason: ${notes || 'Unable to fulfill specifications'}.`,
          type: "system",
          priority: "medium",
          link_url: `/account/custom-cakes/${id}`,
        });
      } catch {
        // Non-blocking
      }

      return NextResponse.json({
        success: true,
        message: "Request marked as rejected.",
      });
    }

    return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Admin custom cake action error:", message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
