import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createSupabaseAdminClient(url, key);
}

// Resilient helper to update seller_profiles before and after migration
async function updateSellerProfileSafely(
  supabaseAdmin: any,
  sellerId: string,
  fullUpdates: Record<string, any>,
  minimalUpdates: Record<string, any>
) {
  const { error } = await supabaseAdmin
    .from("seller_profiles")
    .update(fullUpdates)
    .eq("id", sellerId);

  if (error && (error.code === "42703" || error.message?.includes("does not exist"))) {
    const { error: minErr } = await supabaseAdmin
      .from("seller_profiles")
      .update(minimalUpdates)
      .eq("id", sellerId);
    if (minErr) throw minErr;
  } else if (error) {
    throw error;
  }
}

// Resilient helper to record audit events before and after migration
async function insertEventSafely(
  supabaseAdmin: any,
  sellerId: string,
  eventType: string,
  fullComment: string,
  reason?: string,
  note?: string,
  prevStatus?: string,
  newStatus?: string,
  actorId?: string
) {
  // Standard event_type that satisfies old valid_events constraint
  const safeEventType =
    eventType === "reconsidered" || eventType === "correction_required"
      ? "under_review"
      : eventType;

  const { error } = await supabaseAdmin.from("seller_application_events").insert({
    seller_id: sellerId,
    event_type: eventType,
    previous_status: prevStatus,
    new_status: newStatus,
    actor_id: actorId,
    admin_reason: reason,
    admin_note: note,
    admin_comment: fullComment,
  } as any);

  if (error) {
    // Retry with standard columns if migration columns or constraint not yet updated
    await supabaseAdmin.from("seller_application_events").insert({
      seller_id: sellerId,
      event_type: safeEventType,
      admin_comment: fullComment,
    } as any);
  }
}

export async function POST(req: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
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
              // Ignore in route handler
            }
          },
        },
      }
    );

    // 1. Authenticate Request
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Please sign in to proceed." },
        { status: 401 }
      );
    }

    // 2. Authorize Administrator Role
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr || profile?.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Administrator privileges required." },
        { status: 403 }
      );
    }

    // 3. Parse Request Payload
    const body = await req.json();
    const { sellerId, action, reason, note } = body;

    if (!sellerId || typeof sellerId !== "string") {
      return NextResponse.json(
        { success: false, error: "Validation error: sellerId is required." },
        { status: 400 }
      );
    }

    const validActions = [
      "approve",
      "return_for_correction",
      "reject",
      "reconsider",
      "under_review",
      "suspend",
      "unsuspend",
    ];

    if (!action || !validActions.includes(action)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid action. Permitted actions: ${validActions.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const trimmedReason = typeof reason === "string" ? reason.trim() : "";
    const trimmedNote = typeof note === "string" ? note.trim() : "";

    // Validation for correction and rejection
    if (action === "return_for_correction" && !trimmedReason) {
      return NextResponse.json(
        { success: false, error: "A correction reason is required." },
        { status: 400 }
      );
    }

    if (action === "reject" && !trimmedReason) {
      return NextResponse.json(
        { success: false, error: "A rejection reason is required." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 4. Fetch target seller profile
    const { data: seller, error: sellerFetchErr } = await supabaseAdmin
      .from("seller_profiles")
      .select("id, business_name, contact_name, phone, business_email, verification_status, seller_id_code")
      .eq("id", sellerId)
      .maybeSingle();

    if (sellerFetchErr || !seller) {
      return NextResponse.json(
        { success: false, error: "Seller application not found." },
        { status: 404 }
      );
    }

    const prevStatus = seller.verification_status;
    let newStatus = prevStatus;
    let successMessage = "";
    const now = new Date().toISOString();

    // 5. Execute Action Workflow
    if (action === "approve") {
      newStatus = "approved";
      successMessage = `Seller "${seller.business_name || seller.contact_name}" and store have been successfully approved.`;

      // Try RPC first
      let rpcSucceeded = false;
      try {
        const { error: rpcErr } = await supabaseAdmin.rpc("approve_seller", {
          p_seller_id: sellerId,
        });
        if (!rpcErr) {
          rpcSucceeded = true;
        } else {
          console.warn("[AdminSellerAction] approve_seller RPC note:", rpcErr.message);
        }
      } catch (e) {
        console.warn("[AdminSellerAction] approve_seller RPC exception:", e);
      }

      if (!rpcSucceeded) {
        let code = seller.seller_id_code;
        if (!code) {
          const timestampSuffix = Math.floor(1000 + Math.random() * 9000);
          code = `SLR-${timestampSuffix}`;
        }

        // 1. Update seller_profiles safely
        await updateSellerProfileSafely(
          supabaseAdmin,
          sellerId,
          {
            verification_status: "approved",
            seller_id_code: code,
            approved_at: now,
            reviewed_at: now,
            seller_level: "Verified Seller",
            membership_plan: "BASIC",
            membership_status: "active",
            membership_started_at: now,
            max_products: 10,
            storage_limit_mb: 500,
            admin_users_limit: 1,
            rejection_reason: null,
            rejection_note: null,
            correction_reason: null,
            correction_note: null,
            updated_at: now,
          },
          {
            verification_status: "approved",
            seller_id_code: code,
            approved_at: now,
            seller_level: "Verified Seller",
            membership_plan: "BASIC",
            membership_status: "active",
            membership_started_at: now,
            updated_at: now,
          }
        );

        // 2. Update user profile role
        await supabaseAdmin.from("profiles").update({ role: "seller", updated_at: now }).eq("id", sellerId);

        // 3. Update existing store (prevent duplicate)
        const { data: existingStores } = await supabaseAdmin.from("stores").select("id").eq("seller_id", sellerId);

        if (existingStores && existingStores.length > 0) {
          await supabaseAdmin.from("stores").update({ status: "approved", updated_at: now }).eq("seller_id", sellerId);
        } else {
          const rawName = seller.business_name || "Official Store";
          const baseSlug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "") || "seller-store";
          const finalSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 10)}`;

          await supabaseAdmin.from("stores").insert({
            seller_id: sellerId,
            name: rawName,
            slug: finalSlug,
            status: "approved",
          });
        }

        // 4. Log event
        await insertEventSafely(
          supabaseAdmin,
          sellerId,
          "approved",
          "Seller application approved by administrator",
          undefined,
          undefined,
          prevStatus,
          "approved",
          user.id
        );

        // 5. Send notification
        await supabaseAdmin.from("seller_notifications").insert({
          seller_id: sellerId,
          title: "Application Approved! 🎉",
          message: "Congratulations! Your seller application has been approved. You are now a Verified Seller.",
          type: "approval",
          priority: "high",
          link_url: "/seller",
        });
      }
    } else if (action === "return_for_correction") {
      newStatus = "correction_required";
      successMessage = `Application returned to seller for correction: "${trimmedReason}".`;

      const fullComment = trimmedNote ? `${trimmedReason}\n\nAdmin Note: ${trimmedNote}` : trimmedReason;
      let rpcSucceeded = false;

      try {
        const { error: rpcErr } = await supabaseAdmin.rpc("return_for_correction", {
          p_seller_id: sellerId,
          p_comment: fullComment,
        });
        if (!rpcErr) {
          rpcSucceeded = true;
        } else {
          console.warn("[AdminSellerAction] return_for_correction RPC note:", rpcErr.message);
        }
      } catch (e) {
        console.warn("[AdminSellerAction] return_for_correction RPC exception:", e);
      }

      // Update seller_profiles safely
      await updateSellerProfileSafely(
        supabaseAdmin,
        sellerId,
        {
          verification_status: "correction_required",
          correction_reason: trimmedReason,
          correction_note: trimmedNote || null,
          reviewed_at: now,
          updated_at: now,
        },
        {
          verification_status: "correction_required",
          updated_at: now,
        }
      );

      // Update store status to pending if not approved
      await supabaseAdmin
        .from("stores")
        .update({ status: "pending", updated_at: now })
        .eq("seller_id", sellerId)
        .neq("status", "approved");

      if (!rpcSucceeded) {
        await insertEventSafely(
          supabaseAdmin,
          sellerId,
          "correction_requested",
          fullComment,
          trimmedReason,
          trimmedNote || undefined,
          prevStatus,
          "correction_required",
          user.id
        );
      }

      // Always deliver notification
      await supabaseAdmin.from("seller_notifications").insert({
        seller_id: sellerId,
        title: "Action Required: Application Corrections Needed",
        message: `Your seller application requires corrections. Reason: ${trimmedReason}${
          trimmedNote ? ` Note: ${trimmedNote}` : ""
        }`,
        type: "warning",
        priority: "high",
        link_url: "/seller/application-tracking",
      });
    } else if (action === "reject") {
      newStatus = "rejected";
      successMessage = `Seller application has been rejected: "${trimmedReason}".`;

      const fullComment = trimmedNote ? `${trimmedReason}\n\nAdmin Note: ${trimmedNote}` : trimmedReason;
      let rpcSucceeded = false;

      try {
        const { error: rpcErr } = await supabaseAdmin.rpc("reject_seller", {
          p_seller_id: sellerId,
        });
        if (!rpcErr) {
          rpcSucceeded = true;
        } else {
          console.warn("[AdminSellerAction] reject_seller RPC note:", rpcErr.message);
        }
      } catch (e) {
        console.warn("[AdminSellerAction] reject_seller RPC exception:", e);
      }

      // Update seller_profiles safely
      await updateSellerProfileSafely(
        supabaseAdmin,
        sellerId,
        {
          verification_status: "rejected",
          rejection_reason: trimmedReason,
          rejection_note: trimmedNote || null,
          reviewed_at: now,
          updated_at: now,
        },
        {
          verification_status: "rejected",
          updated_at: now,
        }
      );

      // Demote role to customer
      await supabaseAdmin.from("profiles").update({ role: "customer", updated_at: now }).eq("id", sellerId);

      // Set stores status to rejected
      await supabaseAdmin.from("stores").update({ status: "rejected", updated_at: now }).eq("seller_id", sellerId);

      if (!rpcSucceeded) {
        await insertEventSafely(
          supabaseAdmin,
          sellerId,
          "rejected",
          fullComment,
          trimmedReason,
          trimmedNote || undefined,
          prevStatus,
          "rejected",
          user.id
        );
      }

      // Send notification to seller
      await supabaseAdmin.from("seller_notifications").insert({
        seller_id: sellerId,
        title: "Seller Application Update: Rejected",
        message: `Your seller application was not approved. Reason: ${trimmedReason}${
          trimmedNote ? ` Note: ${trimmedNote}` : ""
        }`,
        type: "warning",
        priority: "high",
        link_url: "/seller/application-tracking",
      });
    } else if (action === "reconsider" || action === "under_review") {
      newStatus = "under_review";
      successMessage = `Seller application has been moved to Under Review for reconsideration.`;

      let rpcSucceeded = false;
      try {
        const { error: rpcErr } = await supabaseAdmin.rpc("reconsider_seller", {
          p_seller_id: sellerId,
          p_note: trimmedNote || "Moved to Under Review by administrator",
        });
        if (!rpcErr) {
          rpcSucceeded = true;
        } else {
          console.warn("[AdminSellerAction] reconsider_seller RPC note:", rpcErr.message);
        }
      } catch (e) {
        console.warn("[AdminSellerAction] reconsider_seller RPC exception:", e);
      }

      // Update seller_profiles safely
      await updateSellerProfileSafely(
        supabaseAdmin,
        sellerId,
        {
          verification_status: "under_review",
          reviewed_at: now,
          updated_at: now,
        },
        {
          verification_status: "under_review",
          updated_at: now,
        }
      );

      // Update store status to under_review if not approved
      await supabaseAdmin
        .from("stores")
        .update({ status: "under_review", updated_at: now })
        .eq("seller_id", sellerId)
        .neq("status", "approved");

      if (!rpcSucceeded) {
        await insertEventSafely(
          supabaseAdmin,
          sellerId,
          "under_review",
          trimmedNote || "Application reconsidered by administrator and placed Under Review",
          undefined,
          trimmedNote || undefined,
          prevStatus,
          "under_review",
          user.id
        );
      }

      // Send notification
      await supabaseAdmin.from("seller_notifications").insert({
        seller_id: sellerId,
        title: "Application Under Reconsideration",
        message: trimmedNote || "Your seller application is being reconsidered by our team and is now Under Review.",
        type: "system",
        priority: "high",
        link_url: "/seller/application-tracking",
      });
    } else if (action === "suspend") {
      newStatus = "suspended";
      successMessage = `Seller has been suspended.`;

      const { error: rpcErr } = await supabaseAdmin.rpc("suspend_seller", { p_seller_id: sellerId });
      if (rpcErr) {
        await supabaseAdmin.from("seller_profiles").update({ verification_status: "suspended", updated_at: now }).eq("id", sellerId);
        await supabaseAdmin.from("profiles").update({ role: "customer", updated_at: now }).eq("id", sellerId);
        await supabaseAdmin.from("stores").update({ status: "suspended", updated_at: now }).eq("seller_id", sellerId);
        await insertEventSafely(supabaseAdmin, sellerId, "suspended", "Seller suspended by administrator", undefined, undefined, prevStatus, "suspended", user.id);
      }
    } else if (action === "unsuspend") {
      newStatus = "approved";
      successMessage = `Seller has been unsuspended and reactivated.`;

      const { error: rpcErr } = await supabaseAdmin.rpc("unsuspend_seller", { p_seller_id: sellerId });
      if (rpcErr) {
        await supabaseAdmin.from("seller_profiles").update({ verification_status: "approved", updated_at: now }).eq("id", sellerId);
        await supabaseAdmin.from("profiles").update({ role: "seller", updated_at: now }).eq("id", sellerId);
        await supabaseAdmin.from("stores").update({ status: "approved", updated_at: now }).eq("seller_id", sellerId);
        await insertEventSafely(supabaseAdmin, sellerId, "approved", "Seller unsuspended and reactivated", undefined, undefined, prevStatus, "approved", user.id);
      }
    }

    return NextResponse.json({
      success: true,
      seller_id: sellerId,
      status: newStatus,
      previous_status: prevStatus,
      message: successMessage,
    });
  } catch (err: unknown) {
    console.error("[AdminSellerAction Error]:", err);
    const technicalMessage =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : "Failed to process seller action.";

    return NextResponse.json(
      {
        success: false,
        error: technicalMessage || "Failed to process seller action.",
      },
      { status: 500 }
    );
  }
}
